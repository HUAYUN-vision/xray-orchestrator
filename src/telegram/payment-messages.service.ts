import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InputFile } from 'grammy';
import QRCode from 'qrcode';
import type { Currency } from '../database/enums';
import { UsersRepository } from '../database/repositories/users.repository';
import { DEFAULT_LOCALE, type Locale } from '../i18n/i18n.constants';
import { I18nService } from '../i18n/i18n.service';
import { type PaidDeposit, TopUpError, TopUpService } from '../modules/payments/top-up.service';
import { WidgetScreensService } from '../widget/widget-screens.service';
import type { WidgetState } from '../widget/widget-state';
import type { AppBot } from './bot-context';
import { money } from './menu/format';
import { MenuService } from './menu/menu.service';
import { BOT } from './telegram.constants';

export interface InvoiceTarget {
  userId: string;
  chatId: number;
  messageId: number;
  locale: Locale;
}

/**
 * Top-up messages (D20). The payment link goes as a separate message:
 * a button with a URL for YooKassa, a QR code picture for WeChat (it is scanned in WeChat).
 * After the payment the user gets a message and the menu is refreshed.
 */
@Injectable()
export class PaymentMessagesService implements OnModuleInit {
  private readonly logger = new Logger(PaymentMessagesService.name);

  constructor(
    @Inject(BOT) private readonly bot: AppBot,
    private readonly topUps: TopUpService,
    private readonly screens: WidgetScreensService,
    private readonly menu: MenuService,
    private readonly users: UsersRepository,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit(): void {
    this.topUps.onPaid((deposit) => this.onPaid(deposit));
  }

  /** Creates an invoice, sends the payment link and returns the top-up screen with the result. */
  async sendInvoice(
    target: InvoiceTarget,
    currency: Currency,
    amount: string,
  ): Promise<WidgetState> {
    const { userId, chatId, locale } = target;
    try {
      const invoice = await this.topUps.create({
        userId,
        currency,
        amount,
        description: this.i18n.t(locale, 'topup-description'),
        // Back to the bot chat after paying on the YooKassa page.
        returnUrl: `https://t.me/${this.bot.botInfo.username}`,
        messageId: target.messageId,
        locale,
      });
      const sum = money(invoice.amount, invoice.currency);
      if (invoice.provider === 'wechat') {
        const png = await QRCode.toBuffer(invoice.paymentUrl, { width: 512, margin: 2 });
        await this.bot.api.sendPhoto(chatId, new InputFile(png, 'wechat-pay.png'), {
          caption: this.i18n.t(locale, 'topup-qr', { amount: sum }),
        });
      } else {
        await this.bot.api.sendMessage(chatId, this.i18n.t(locale, 'topup-link', { amount: sum }), {
          reply_markup: {
            inline_keyboard: [
              [{ text: this.i18n.t(locale, 'topup-pay'), url: invoice.paymentUrl }],
            ],
          },
        });
      }
      return await this.screens.topUp(userId, 'inv');
    } catch (err) {
      if (err instanceof TopUpError) {
        this.logger.warn(`Top-up for user ${userId} failed: ${err.message}`);
        return this.screens.topUp(userId, 'payerr');
      }
      this.logger.error(`Top-up for user ${userId} failed: ${String(err)}`);
      return this.screens.topUp(userId, 'err');
    }
  }

  private async onPaid(deposit: PaidDeposit): Promise<void> {
    const [user] = await this.users.findByIds([deposit.userId]);
    if (!user) return;
    const locale = this.localeOf(user.language ?? deposit.meta.locale);
    const sum = money(deposit.amount, deposit.currency);
    await this.bot.api.sendMessage(
      user.telegramId,
      this.i18n.t(locale, 'topup-paid', { amount: sum }),
    );

    const messageId = deposit.meta.messageId;
    if (!messageId) return;
    try {
      const state = await this.screens.home(deposit.userId, 'dep');
      const view = await this.menu.view(state, locale, deposit.userId);
      await this.bot.api.editMessageText(user.telegramId, messageId, view.text, {
        parse_mode: 'HTML',
        reply_markup: view.reply_markup,
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      // The menu may be deleted or too old to edit: the message above is enough.
      this.logger.debug(`Menu refresh after top-up failed: ${String(err)}`);
    }
  }

  private localeOf(code: string | null | undefined): Locale {
    return code && this.i18n.isSupported(code) ? code : DEFAULT_LOCALE;
  }
}
