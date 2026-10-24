/*
 * Viewer Cinema — deployment configuration.
 *
 * Edit the values below once, OR override any of them per OBS source through
 * the URL query string, e.g.
 *   file:///C:/overlays/viewer-cinema/index.html?port=8080&password=secret&bg=transparent
 *
 * URL parameters always win over this file.
 */
window.CINEMA_CONFIG = {
  // ---- Streamer.bot WebSocket Server (Servers/Clients → WebSocket Server) ----
  host: '127.0.0.1',        // ?host=
  port: 8080,               // ?port=
  endpoint: '/',            // ?endpoint=
  secure: false,            // ?secure=1  → wss:// (only for remote setups behind TLS)
  password: '',             // ?password=  (only needed if "Authentication" + "Enforce" are on)

  // ---- Viewer list ----
  pollSeconds: 60,          // ?poll=  safety re-sync interval; 0 disables (events still work)
  leaveGraceSeconds: 90,    // ?grace= how long a viewer may be missing before walking out
  hideBroadcaster: false,   // ?hideBroadcaster=1
  // Accounts that never get a seat (case-insensitive). ?ignore=bot1,bot2 replaces this list.
  ignore: [
    'nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot',
    'soundalerts', 'sery_bot', 'commanderroot', 'kofistreambot', 'own3d',
    'botrixoficial', 'tangiabot', 'pokemoncommunitygame', 'lumiastream', 'blerp',
    'streamstickers', 'frostytoolsdotcom', 'creatisbot', 'wzbot'
  ],

  // ---- Look ----
  // Оформление зала: 'classic' (дерево и бархат) или 'cyberpunk' (неон).
  cinemaTheme: 'classic',   // ?theme=classic | cyberpunk
  background: 'dark',       // ?bg=dark | transparent | #rrggbb
  maxSeats: 60,             // ?seats= cap (layout has 60 seats)
  showCounter: true,        // ?counter=0 hides "Зрители"
  counterLabel: 'Зрители',
  signText: 'Cinema',        // ?sign= название на вывеске; длинный текст автоматически уменьшается
  // Ковры: обычные прямоугольные изображения сверху, без перспективы.
  // rug1 = ближе к экрану, rug2 = ближе ко входу. null скрывает ковёр.
  // Комплектные ковры (любой темы) автоматически меняются вместе с cinemaTheme.
  rugs: {
    rug1: 'assets/themes/classic/rug-1.png',
    rug2: 'assets/themes/classic/rug-2.png'
  },
  // Комплектные постеры слева направо; можно заменить своими PNG/JPG/SVG.
  // null, отсутствующая настройка или ошибка загрузки = пустая стена.
  posters: {
    poster1: 'assets/posters/world-of-warcraft.png',
    poster2: 'assets/posters/ragnarok-online.png',
    poster3: 'assets/posters/cyberpunk-2077.png',
    poster4: 'assets/posters/factorio.png',
    poster5: 'assets/posters/apex-legends.png'
  },
  initialEntrance: 'seated',  // ?initial=walk | seated  (how viewers present at page load appear)

  // Сообщения Twitch над персонажами (на всех страницах).
  showChatBubbles: true,    // ?bubbles=0 выключает облачка
  chatBubbleSeconds: 5,     // ?bubbleSeconds= сколько секунд показывать сообщение
  chatBubbleMaxChars: 48,   // ?bubbleChars= предел длины; дальше троеточие

  rememberAudience: true,   // ?remember=0 disables local audience persistence

  // ---- Содержимое экрана: starting.html, break.html, ending.html ----
  startingText: 'Стрим скоро начнется', // ?text= переопределяет текст стартовой сцены
  // Ссылка именно на встраиваемый чат (виджет), разрешающий iframe.
  // Browser Source URL вашего виджета. Для встроенного чата установите chatUrl: ''.
  chatUrl: '', // ?chatUrl=; укажите свою ссылку на встраиваемый виджет чата
  // Альтернатива iframe: Twitch-чат через Streamer.bot, без внешнего виджета.
  // В break.html?chatMode=streamerbot используются Twitch.ChatMessage.
  chatMode: 'streamerbot',             // streamerbot | embed; chatUrl включает embed
  breakText: 'Перерыв. Скоро вернусь!',
  endingText: 'Стрим завершен',         // ?text= в ending.html
  thanksText: 'Спасибо, что были с нами!', // ?thanks=
  creditsSpeed: 45,                    // ?creditsSpeed= скорость прокрутки, px/сек экрана
  creditsIntroSeconds: 4,              // ?creditsIntro= длительность вступления
  creditsLoop: false,                  // ?creditsLoop=1: повторять весь цикл; false: один раз
  creditsThanksSeconds: 4,             // ?creditsThanks= секунд благодарности перед повтором
  // Порядок и заголовки групп. path — точный путь массива в ответе GetCredits.
  creditsGroups: [
    { title: 'Наши зрители', path: ['users', 'users'] },
    { title: 'Новые фолловеры', path: ['events', 'follows'] },
    { title: 'Подписчики', path: ['events', 'subs'] },
    { title: 'Продления подписки', path: ['events', 'resubs'] },
    { title: 'Подаренные подписки', path: ['events', 'giftsubs'] },
    { title: 'Массовые подарки', path: ['events', 'giftbombs'] },
    { title: 'Поддержка Bits', path: ['events', 'cheers'] },
    { title: 'Рейды', path: ['events', 'raided'] },
    { title: 'Модераторы', path: ['users', 'moderators'] },
    { title: 'VIP', path: ['users', 'vips'] },
    { title: 'Все подписчики', path: ['users', 'subscribers'] },
    { title: 'Редакторы', path: ['users', 'editors'] },
    { title: 'Проводники хайп-поезда', path: ['hypeTrain', 'conductors'] },
    { title: 'Участники хайп-поезда', path: ['hypeTrain', 'contributors'] },
    { title: 'Награды за баллы канала', path: ['events', 'rewardRedemptions'] },
    { title: 'Вклад в цели', path: ['events', 'goalContributions'] },
    { title: 'Строители пирамид', path: ['events', 'pyramids'] },
    { title: 'Хайп-поезда', path: ['events', 'hypeTrains'] },
    { title: 'Топ Bits за всё время', path: ['top', 'allBits'] },
    { title: 'Топ Bits за месяц', path: ['top', 'monthBits'] },
    { title: 'Топ Bits за неделю', path: ['top', 'weekBits'] },
    { title: 'Топ баллов канала', path: ['top', 'channelRewards'] }
  ],

  // ---- Developer ----
  debug: false,             // ?debug=1   logs to the browser console only (never on screen)
  demo: false               // ?demo=1    simulated viewers, no Streamer.bot needed
};
