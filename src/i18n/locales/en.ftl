language-name = English

start =
    Hi, { $name }! I manage Xray keys.

    Commands: /help
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
