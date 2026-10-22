# Проверки

Нужны Node.js, Python 3, пакет Playwright и Chromium:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/room_mesh.py
python3 tests/run_tests.py
python3 tests/scene_pages.py
python3 tests/cinema_themes.py
```

`room_mesh.py` проверяет текущие координаты пола, мест, маршрутов и экрана;
дополнительных пакетов Python для него не нужно. Браузерные наборы запускают
mock Streamer.bot и проверяют рассадку, графику, подключение, сцены и облачка.
`cinema_themes.py` сравнивает геометрию, маски перекрытия и экран в обеих темах,
а также проверяет выбор оформления и замену ковров.
Полный набор `run_tests.py` занимает несколько минут, включая длительный прогон.

По умолчанию `run_tests.py` открывает `index.html` как локальный файл, как в OBS.
Если политика браузера запрещает `file://`, запустите HTTP-сервер из корня проекта:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

В другом терминале укажите адрес страницы. При необходимости выберите системный браузер:

```sh
TEST_PAGE_URL=http://127.0.0.1:8000/index.html CHROMIUM_EXECUTABLE=/usr/bin/chromium python3 tests/run_tests.py
CHROMIUM_EXECUTABLE=/usr/bin/chromium python3 tests/scene_pages.py
python3 tests/cinema_themes.py
```

`scene_pages.py` запускает свой HTTP-сервер. Переменная `SHOTS` меняет папку
снимков экрана. Эти тесты проверяют протокол с mock-сервером и не заменяют
проверку с реальным Streamer.bot и OBS.
