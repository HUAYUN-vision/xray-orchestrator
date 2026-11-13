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

# /id — для всех; админка серверов (D19), сообщения в HTML
id-yours = Ваш id: <code>{ $id }</code>
command-servers = Серверы (админ)
command-server_add = Добавить сервер (админ)
admin-servers-title = <b>Серверы</b>
admin-servers-empty = Серверов пока нет.
admin-add-hint = Добавить: /server_add &lt;code&gt; &lt;host&gt; &lt;api_key&gt; [api_port]
admin-add-usage =
    Формат: <code>/server_add &lt;code&gt; &lt;host&gt; &lt;api_key&gt; [api_port]</code>
    Пример: <code>/server_add nl 1.2.3.4 SECRET 440</code>
    code — латиница, цифры и дефис (например nl, de-2); api_port по умолчанию 440.
    Сообщение с ключом бот удаляет.
admin-add-invalid = Неверный параметр: <b>{ $field }</b>. Отправьте команду ещё раз (сообщение с ключом удалено).
admin-add-checking = Проверяю ноду <b>{ $code }</b>…
admin-add-exists = Сервер с таким code или host уже есть.
admin-add-unreachable = Нода <b>{ $code }</b> не отвечает, сервер не сохранён:
    <code>{ $error }</code>
admin-see-list = Список: /servers
admin-node-clients = ключей на ноде: { $count }
admin-node-down = ⚠️ нода недоступна
admin-btn-refresh = 🔄 Обновить
admin-btn-delete = 🗑 Да, удалить
admin-btn-cancel = Отмена
admin-delete-confirm = Удалить сервер <b>{ $code }</b> ({ $host })? Наши ключи будут удалены с ноды, сервер пропадёт из подписок.
admin-added = ✅ Сервер <b>{ $code }</b> добавлен и включён, ключей на ноду: +{ $added }
admin-added-node-down = ✅ Сервер <b>{ $code }</b> добавлен, но ключи поставить не удалось — повторится при синхронизации:
    <code>{ $error }</code>
admin-enabled = ▶️ <b>{ $code }</b> включён, ключей на ноду: +{ $added }
admin-enabled-node-down = ▶️ <b>{ $code }</b> включён, но нода недоступна — ключи поставятся при синхронизации:
    <code>{ $error }</code>
admin-disabled = ⏸ <b>{ $code }</b> выключен, ключей удалено с ноды: { $removed }
admin-disabled-node-down = ⏸ <b>{ $code }</b> выключен, но нода недоступна — ключи удалятся при синхронизации:
    <code>{ $error }</code>
admin-synced = 🔄 <b>{ $code }</b>: +{ $added } −{ $removed }
admin-synced-node-down = 🔄 <b>{ $code }</b>: нода недоступна
    <code>{ $error }</code>
admin-deleted = 🗑 <b>{ $code }</b> удалён, ключей удалено с ноды: { $removed }
admin-deleted-node-down = 🗑 <b>{ $code }</b> удалён, но нода недоступна — наши ключи на ней остались, удалите их вручную:
    <code>{ $error }</code>
admin-none-enabled = ⚠️ Включённых серверов не осталось — покупка ключей недоступна.
admin-not-found = Сервер не найден.
admin-error = Ошибка, попробуйте ещё раз.
admin-progress-toast = ⏳ Выполняю…
admin-progress-list = ⏳ Обновляю список и проверяю ноды…
admin-progress-on = ⏳ Включаю <b>{ $code }</b> и ставлю ключи на ноду…
admin-progress-off = ⏳ Выключаю <b>{ $code }</b> и удаляю ключи с ноды…
admin-progress-sync = ⏳ Синхронизирую <b>{ $code }</b>…
admin-progress-del = ⏳ Удаляю <b>{ $code }</b> и чищу ноду…
