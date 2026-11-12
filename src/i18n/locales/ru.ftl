language-name = Русский

start =
    Привет, { $name }! Я бот для управления ключами Xray.

    Список команд: /help
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
