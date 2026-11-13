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
w-copy = Copy subscription link
w-copied = Link copied
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
w-m-slow = Too fast, wait a couple of seconds
w-m-err = Something went wrong, try again
