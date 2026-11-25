language-name = English

start = Hi, { $name }! Your VPN: balance, plans and keys. Commands: /help
help =
    Commands:
    /start — start
    /help — this help
    /language — change language

language-current =
    Current language: { $language }.

    Available languages:
    { $list }

    To change: /language <code>, e.g. /language ru
language-changed = Language switched to { $language }.
language-unknown = Unknown language "{ $code }". Available: { $codes }.

# Command descriptions in the Telegram menu
command-start = Start
command-help = Help
command-language = Change language

# Widget (w-*): strings are embedded into the widget HTML, no variables
w-balance = Balance
w-keys = Keys
w-no-keys = No keys yet
w-buy = Buy a key
w-back = Back
w-refresh = Refresh
w-loading = Loading…
w-tariffs = Plans
w-no-tariffs = No plans available
w-days = days
w-until = until
w-expired = expired
w-pay-title = Payment
w-pay = Pay
w-copy = Get subscription link
w-topup = Top up balance
w-topup-title = Top-up
w-topup-hint = The bot will send the payment link as a message. Rubles via YooKassa, yuan via WeChat Pay.
w-howto = Add the subscription link to Hiddify, v2rayN, v2rayNG, Streisand or FoXray. Russian and Chinese sites open directly, without VPN.
w-m-ok = Key created
w-m-funds = Insufficient funds
w-m-stale = Your balance changed, please check again
w-m-price = The price changed, please check again
w-m-rates = Exchange rates are unavailable, try later
w-m-srv = No servers available, try later
w-m-fail = Could not create the key, money returned
w-m-tariff = This plan is unavailable
w-m-gone = Key not found
w-m-link = The link is sent in a message below
w-m-inv = Payment link sent as a message below
w-m-payerr = Top-up is unavailable now, try again later
w-m-dep = Balance topped up
w-m-slow = Too fast, wait a couple of seconds
w-m-err = Something went wrong, try again

# Subscription link (a regular message: copying is blocked inside the widget)
sub-link = Subscription link for your key. Add it to Hiddify, v2rayN, v2rayNG, Streisand or FoXray:
sub-copy = 📋 Copy link

topup-description = VPN balance top-up
topup-link = Invoice for { $amount }. Tap the button to pay. The balance is topped up automatically after payment.
topup-pay = 💳 Pay
topup-qr = Invoice for { $amount }. Scan the QR code in WeChat (or save the picture and open it via "Scan" in WeChat). The balance is topped up automatically after payment.
topup-paid = ✅ Balance topped up by { $amount }

# /id is for everyone; server admin (D19), messages in HTML
id-yours = Your id: <code>{ $id }</code>
command-servers = Servers (admin)
command-server_add = Add a server (admin)
command-tariffs = Tariffs (admin)
command-tariff_add = Add a tariff (admin)
admin-servers-title = <b>Servers</b>
admin-servers-empty = No servers yet.
admin-add-hint = Add: /server_add &lt;code&gt; &lt;host&gt; &lt;api_key&gt; [api_port]
admin-add-usage =
    Format: <code>/server_add &lt;code&gt; &lt;host&gt; &lt;api_key&gt; [api_port]</code>
    Example: <code>/server_add nl 1.2.3.4 SECRET 440</code>
    code — latin letters, digits and dashes (e.g. nl, de-2); api_port defaults to 440.
    The bot deletes the message with the key.
admin-add-invalid = Invalid parameter: <b>{ $field }</b>. Send the command again (the message with the key was deleted).
admin-add-checking = Checking node <b>{ $code }</b>…
admin-add-exists = A server with this code or host already exists.
admin-add-unreachable = Node <b>{ $code }</b> does not respond, the server was not saved:
    <code>{ $error }</code>
admin-see-list = List: /servers
admin-node-clients = keys on the node: { $count }
admin-node-down = ⚠️ node unreachable
admin-btn-refresh = 🔄 Refresh
admin-btn-delete = 🗑 Yes, delete
admin-btn-cancel = Cancel
admin-delete-confirm = Delete server <b>{ $code }</b> ({ $host })? Our keys will be removed from the node, the server disappears from subscriptions.
admin-added = ✅ Server <b>{ $code }</b> added and enabled, keys on the node: +{ $added }
admin-added-node-down = ✅ Server <b>{ $code }</b> added, but keys could not be installed — will retry on sync:
    <code>{ $error }</code>
admin-enabled = ▶️ <b>{ $code }</b> enabled, keys on the node: +{ $added }
admin-enabled-node-down = ▶️ <b>{ $code }</b> enabled, but the node is unreachable — keys will be installed on sync:
    <code>{ $error }</code>
admin-disabled = ⏸ <b>{ $code }</b> disabled, keys removed from the node: { $removed }
admin-disabled-node-down = ⏸ <b>{ $code }</b> disabled, but the node is unreachable — keys will be removed on sync:
    <code>{ $error }</code>
admin-synced = 🔄 <b>{ $code }</b>: +{ $added } −{ $removed }
admin-synced-node-down = 🔄 <b>{ $code }</b>: node unreachable
    <code>{ $error }</code>
admin-deleted = 🗑 <b>{ $code }</b> deleted, keys removed from the node: { $removed }
admin-deleted-node-down = 🗑 <b>{ $code }</b> deleted, but the node is unreachable — our keys stay there, remove them manually:
    <code>{ $error }</code>
admin-none-enabled = ⚠️ No enabled servers left — key purchases are unavailable.
admin-not-found = Server not found.
admin-error = Something went wrong, try again.
admin-progress-toast = ⏳ Working…
admin-progress-list = ⏳ Refreshing the list and checking nodes…
admin-progress-on = ⏳ Enabling <b>{ $code }</b> and installing keys on the node…
admin-progress-off = ⏳ Disabling <b>{ $code }</b> and removing keys from the node…
admin-progress-sync = ⏳ Syncing <b>{ $code }</b>…
admin-progress-del = ⏳ Deleting <b>{ $code }</b> and cleaning the node…

# Tariff admin: same buttons as servers. Hiding does not touch keys already bought.
admin-tariffs-title = <b>Tariffs</b>
admin-tariffs-empty = No tariffs yet.
admin-tariff-add-hint = Add: /tariff_add &lt;days&gt; &lt;price&gt; [currency] [traffic_gb]
admin-tariff-add-usage =
    Format: <code>/tariff_add &lt;days&gt; &lt;price&gt; [currency] [traffic_gb]</code>
    Example: <code>/tariff_add 30 299 rub 100</code>
    days — from 1 to 3650; price — a number with up to 2 decimals, 0 means free.
    currency: rub, cny, usdt (default rub).
    traffic — gigabytes; omit it or pass 0 for unlimited.
    Buyers see the 6 shortest tariffs on sale.
admin-tariff-invalid = Invalid parameter: <b>{ $field }</b>.
admin-tariff-see-list = List: /tariffs
admin-tariff-free = free
admin-tariff-unlimited = unlimited
admin-tariff-traffic = { $gb } GB
admin-tariff-keys = keys: { $count }
admin-tariff-hidden-keys = hidden from sale, keys: { $count }
admin-tariff-added = ✅ Tariff added and on sale: <b>{ $label }</b>
admin-tariff-shown = ▶️ <b>{ $label }</b> is on sale again
admin-tariff-hidden = ⏸ <b>{ $label }</b> is hidden from sale
admin-tariff-keys-stay = Keys already bought keep working.
admin-tariff-deleted = 🗑 Tariff <b>{ $label }</b> deleted
admin-tariff-delete-confirm = Delete tariff <b>{ $label }</b>? Nobody has bought it, so it will be removed for good.
admin-tariff-in-use = Cannot delete this tariff: keys were already bought on it. Hide it from sale — those keys keep working.
admin-tariff-none-active = ⚠️ No tariffs on sale — a key cannot be bought.
admin-tariff-too-many = ⚠️ { $count } tariffs are on sale, buyers only see the { $max } shortest.
admin-tariff-not-found = Tariff not found.
admin-tariff-progress-list = ⏳ Refreshing tariffs…
admin-tariff-progress-on = ⏳ Putting <b>{ $label }</b> back on sale…
admin-tariff-progress-off = ⏳ Hiding <b>{ $label }</b> from sale…
admin-tariff-progress-del = ⏳ Deleting <b>{ $label }</b>…

# Button menu (D21)
menu-language = Language
menu-language-title = Choose a language
menu-price = Price
menu-topup-custom = Custom amount
menu-topup-amount = Send the top-up amount as a message, from { $min } to { $max }.
menu-topup-invalid = Could not read the amount. Send a number from { $min } to { $max }.
