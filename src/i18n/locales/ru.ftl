language-name = Русский

start = Привет, { $name }! Здесь ваш VPN: баланс, тарифы и ключи. Команды: /help
help =
    Команды:
    /start — начать
    /help — эта справка
    /language — сменить язык

language-current =
    Текущий язык: { $language }.

    Доступные языки:
    { $list }

    Сменить: /language <код>, например /language en
language-changed = Язык переключён: { $language }.
language-unknown = Неизвестный язык «{ $code }». Доступные: { $codes }.

# Описания команд в меню Telegram
command-start = Начать
command-help = Справка
command-language = Сменить язык

# Виджет (w-*): строки вшиваются в HTML виджета, без переменных
w-balance = Баланс
w-keys = Ключи
w-no-keys = Ключей пока нет
w-buy = Купить ключ
w-back = Назад
w-refresh = Обновить
w-loading = Загрузка…
w-tariffs = Тарифы
w-no-tariffs = Нет доступных тарифов
w-days = дн.
w-until = до
w-expired = истёк
w-pay-title = Оплата
w-pay = Оплатить
w-copy = Получить ссылку-подписку
w-howto = Добавьте ссылку-подписку в Hiddify, v2rayN, v2rayNG, Streisand или FoXray. Сайты России и Китая открываются напрямую, без VPN.
w-m-ok = Ключ создан
w-m-funds = Недостаточно средств
w-m-stale = Баланс изменился, проверьте ещё раз
w-m-price = Цена изменилась, проверьте ещё раз
w-m-rates = Курс валют недоступен, попробуйте позже
w-m-srv = Нет доступных серверов, попробуйте позже
w-m-fail = Не удалось создать ключ, деньги возвращены
w-m-tariff = Тариф недоступен
w-m-gone = Ключ не найден
w-m-link = Ссылка отправлена сообщением ниже
w-m-slow = Слишком часто, подождите пару секунд
w-m-err = Ошибка, попробуйте ещё раз

# Ссылка-подписка (обычное сообщение: в виджете копирование заблокировано)
sub-link = Ссылка-подписка для вашего ключа. Добавьте её в Hiddify, v2rayN, v2rayNG, Streisand или FoXray:
sub-copy = 📋 Скопировать ссылку
