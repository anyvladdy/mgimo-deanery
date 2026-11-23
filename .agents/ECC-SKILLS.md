# ECC skills в проекте «Цифровой деканат»

Здесь лежат 21 скилл из ECC 2.2.3 (`github.com/affaan-m/ECC`, MIT, ревизия `3f14a103`), выбранные под этот хакатон. Оригиналы не правились.

Каталог скиллов читается из `.agents/skills/`. Среда разработки читает его автоматически, если сессия запущена из корня проекта: `SKILL.md` с фронтматтером `name` + `description` — ровно формат ECC. Ничего устанавливать не нужно, файлы лежат обычным Markdown.

Дизайн-навыки (направление, ревью интерфейса, Web Interface Guidelines) лежат отдельным набором: [DESIGN-SKILLS.md](DESIGN-SKILLS.md).

## Что взято и зачем

| Этап плана | Скиллы |
|---|---|
| Любая задача: найти нужный код | `iterative-retrieval` |
| Этапы 2–4: справки, расписание, ведомость | `tdd-workflow`, `api-design`, `backend-patterns`, `error-handling`, `database-migrations` |
| Общая схема и миграции (интегратор) | `database-migrations`, `coding-standards` |
| Этап 5: публикация | `deployment-patterns` |
| Этап 6: главная и уведомления | `frontend-patterns`, `frontend-design-direction` |
| Этап 7: телефон и оформление | `make-interfaces-feel-better`, `accessibility`, `browser-qa` |
| Этап 8: сквозная проверка | `verification-loop`, `e2e-testing`, `click-path-audit` |
| Личные данные и чужие заявки | `security-review` |
| Ветки, worktree, коммиты | `git-workflow` |
| README, PLAN, передача проекта | `docs-governance`, `strategic-compact` |
| Двое и больше агентов в параллель | `team-agent-orchestration`, `context-budget` |

Полный каталог ECC — 327 скиллов. Целиком его ставить не стоит: каждое описание висит в каталоге каждой сессии. Здесь только то, что встречается в этом плане.

## Что НЕ взято и почему

- **Хуки** (`hooks/hooks.json`, 28 штук на 8 событий) — Node-скрипты под протокол Claude Code: читают JSON со stdin и блокируют инструмент через `exit 2`. В текущем окружении пользовательских shell-хуков нет: переносить нечего.
- **72 агента** — фронтматтер под Claude (`model: sonnet`, `tools:`). Тела промптов можно брать руками, но автоматом они не подхватываются.
- **98 команд** (`/ecc:*`) — в текущем окружении команды — нативные плагины, а не папка с Markdown.
- **MCP** — ECC тянет `chrome-devtools-mcp`; для этого проекта не нужен.
- **`rules/`** — у проекта свой подробный `AGENTS.md`; чужие правила поверх него только конфликтуют.

## Оговорки

- В `strategic-compact` и `tdd-workflow` есть разделы про установку хуков и пути `~/.claude/...`. К нам они не относятся, остальное в этих скиллах полезно как есть.
- Некоторые скиллы советуют инструменты, которых здесь нет (`Task`, `subagent_type`). Читай как рекомендации, а не как команды.
- Обновление: скопировать папку скилла из свежего клона ECC поверх старой. Версия записана выше, чтобы diff был осмысленным.

## Источники и лицензии

- ECC (`github.com/affaan-m/ECC`, MIT) — [`licenses/ECC-MIT.txt`](licenses/ECC-MIT.txt).
- Emil Kowalski, design engineering — [`licenses/EMIL-SKILLS-MIT.txt`](licenses/EMIL-SKILLS-MIT.txt).
- Anthropic, frontend design — [`licenses/ANTHROPIC-FRONTEND-DESIGN-APACHE-2.0.txt`](licenses/ANTHROPIC-FRONTEND-DESIGN-APACHE-2.0.txt).
- Vercel, Web Interface Guidelines — [`licenses/VERCEL-WEB-INTERFACE-GUIDELINES-MIT.txt`](licenses/VERCEL-WEB-INTERFACE-GUIDELINES-MIT.txt).
- Microsoft, skills — [`licenses/MICROSOFT-SKILLS-MIT.txt`](licenses/MICROSOFT-SKILLS-MIT.txt).
