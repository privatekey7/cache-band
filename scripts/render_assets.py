"""Рисует SVG-иллюстрации для README: героя с анимацией, таблицу состояний и панель /cache.

Цвета и пороги повторяют hooks/cache.ts, чтобы картинки совпадали с тем, что рисует мод.
Запуск: python scripts/render_assets.py  →  docs/assets/*.svg (тёмная и светлая темы).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent.parent / "docs" / "assets"

GREEN = (34, 197, 94)
YELLOW = (234, 179, 8)
ORANGE = (249, 115, 22)
RED = "#ef4444"
GREY = "#6b7280"
COOLING_START = 0.35
COOLING_FULL = 0.25
BAR_CELLS = 6
BIG_CAPSULE_X = 560
BIG_PERCENT_X = 852

FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Inter, Roboto, sans-serif"
MONO_DIGITS = "font-variant-numeric: tabular-nums;"


@dataclass(frozen=True)
class Theme:
    name: str
    page: str
    card: str
    card_border: str
    text: str
    dim: str
    empty_segment: str
    accent: str


DARK = Theme("dark", "#141414", "#262626", "#363636", "#ececec", "#8b8b8b", "#4a4a4a", "#3b82f6")
LIGHT = Theme("light", "#f6f6f4", "#ffffff", "#e3e3e0", "#1c1c1c", "#8a8a8a", "#cfcfcc", "#2563eb")


def mix(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> str:
    clamped = min(1.0, max(0.0, t))
    channels = [round(a + (b - a) * clamped) for a, b in zip(start, end)]
    return "#" + "".join(f"{c:02x}" for c in channels)


def live_color(fraction: float) -> str:
    if fraction >= COOLING_START:
        return mix(GREEN, GREEN, 0)
    if fraction >= COOLING_FULL:
        return mix(GREEN, YELLOW, (COOLING_START - fraction) / (COOLING_START - COOLING_FULL))
    return mix(YELLOW, ORANGE, (COOLING_FULL - fraction) / COOLING_FULL)


@dataclass(frozen=True)
class Capsule:
    filled: int
    color: str
    percent: str
    percent_color: str | None = None


def capsule_for(fraction: float) -> Capsule:
    filled = max(1, round(fraction * BAR_CELLS)) if fraction > 0 else 0
    return Capsule(filled, live_color(fraction), f"{max(1, round(fraction * 100))}%")


DEAD = Capsule(0, RED, "0%", RED)
EMPTY = Capsule(0, GREY, "—")
WORKING = Capsule(BAR_CELLS, mix(GREEN, GREEN, 0), "100%")


def segments(capsule: Capsule, theme: Theme, x: float, y: float, cells: int = BAR_CELLS, size: float = 1.0) -> str:
    """Сегменты как глифы ▰/▱: наклонные скруглённые плашки."""
    width, height, gap = 10 * size, 7 * size, 3.2 * size
    filled = round(capsule.filled * cells / BAR_CELLS) if cells != BAR_CELLS else capsule.filled
    parts = []
    for i in range(cells):
        left = x + i * (width + gap)
        center_x, center_y = left + width / 2, y + height / 2
        # Наклон вокруг центра плашки, иначе skewX сдвигает её на y·tg(угла).
        transform = f'transform="translate({center_x:.2f} {center_y:.2f}) skewX(-14) translate({-center_x:.2f} {-center_y:.2f})"'
        if i < filled:
            parts.append(
                f'<rect x="{left:.2f}" y="{y:.2f}" width="{width:.2f}" height="{height:.2f}" rx="{1.6 * size:.2f}" '
                f'fill="{capsule.color}" {transform}/>'
            )
        else:
            parts.append(
                f'<rect x="{left + 0.6:.2f}" y="{y + 0.6:.2f}" width="{width - 1.2:.2f}" height="{height - 1.2:.2f}" '
                f'rx="{1.4 * size:.2f}" fill="none" stroke="{theme.empty_segment}" stroke-width="1.2" {transform}/>'
            )
    return "".join(parts)


def svg(width: int, height: int, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
    )


def discrete_show(start: float, end: float, total: float) -> str:
    """Показывает группу только в окне [start, end) общего цикла."""
    if start <= 0:
        return (
            f'<animate attributeName="opacity" values="1;0" keyTimes="0;{end / total:.4f}" '
            f'dur="{total}s" calcMode="discrete" repeatCount="indefinite"/>'
        )
    values, times = "0;1;0", f"0;{start / total:.4f};{end / total:.4f}"
    if end >= total:
        values, times = "0;1", f"0;{start / total:.4f}"
    return (
        f'<animate attributeName="opacity" values="{values}" keyTimes="{times}" '
        f'dur="{total}s" calcMode="discrete" repeatCount="indefinite"/>'
    )


def hero(theme: Theme) -> str:
    width, height = 900, 296
    frames: list[tuple[Capsule, float]] = [
        (WORKING, 1.4),
        (capsule_for(1.0), 1.0),
        (capsule_for(0.83), 1.0),
        (capsule_for(0.67), 1.0),
        (capsule_for(0.5), 1.0),
        (capsule_for(0.33), 1.1),
        (capsule_for(0.27), 1.1),
        (capsule_for(0.15), 1.1),
        (capsule_for(0.05), 1.1),
        (DEAD, 2.2),
    ]
    total = sum(duration for _, duration in frames)

    footer_y = 262
    capsule_x, percent_x = 470, 556
    body = [
        f'<rect width="{width}" height="{height}" rx="20" fill="{theme.page}"/>',
        f'<text x="48" y="64" font-family="{FONT}" font-size="30" font-weight="650" fill="{theme.text}">cache-band</text>',
        f'<text x="48" y="96" font-family="{FONT}" font-size="16" fill="{theme.dim}">'
        "Сколько ещё живёт prompt-кэш — прямо под полем ввода Claude Code</text>",
        f'<rect x="40" y="150" width="820" height="62" rx="16" fill="{theme.card}" stroke="{theme.card_border}"/>',
        f'<path d="M71 174v14M64 181h14" stroke="{theme.text}" stroke-width="1.8" stroke-linecap="round"/>',
        f'<text x="98" y="187" font-family="{FONT}" font-size="15" fill="{theme.dim}">Введите / для вызова команд</text>',
        f'<g fill="none" stroke="{theme.text}" stroke-width="1.6" stroke-linecap="round">'
        '<rect x="826" y="170" width="9" height="14" rx="4.5"/><path d="M822 181a8.5 8.5 0 0 0 17 0M830.5 189.5v4"/></g>',
    ]
    shown = 0.0
    for capsule, duration in frames:
        percent_fill = capsule.percent_color or theme.text
        # Крупная копия справа вверху красится цветом капсулы, чтобы переход был виден издалека.
        big_fill = capsule.percent_color or (capsule.color if capsule.filled else theme.dim)
        body.append(
            f'<g opacity="{1 if shown == 0 else 0}">{discrete_show(shown, shown + duration, total)}'
            f"{segments(capsule, theme, capsule_x, footer_y - 10)}"
            f'<text x="{percent_x}" y="{footer_y - 2}" font-family="{FONT}" font-size="13.5" font-weight="500" '
            f'style="{MONO_DIGITS}" fill="{percent_fill}">{capsule.percent}</text>'
            f"{segments(capsule, theme, BIG_CAPSULE_X, 58, size=2.4)}"
            f'<text x="{BIG_PERCENT_X}" y="84" text-anchor="end" font-family="{FONT}" font-size="38" font-weight="650" '
            f'style="{MONO_DIGITS}" fill="{big_fill}">{capsule.percent}</text></g>'
        )
        shown += duration
    body += [
        f'<text x="612" y="{footer_y - 2}" font-family="{FONT}" font-size="13.5" font-weight="500" fill="{theme.text}">Opus 5.5</text>',
        f'<text x="680" y="{footer_y - 2}" font-family="{FONT}" font-size="13.5" fill="{theme.dim}">Средний</text>',
        f'<text x="752" y="{footer_y - 2}" font-family="{FONT}" font-size="13.5" fill="{theme.text}">Авто</text>',
        f'<circle cx="806" cy="{footer_y - 6.5}" r="6.5" fill="none" stroke="{theme.card_border}" stroke-width="2"/>',
        f'<path d="M806 {footer_y - 13} a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="{theme.accent}" stroke-width="2" stroke-linecap="round">'
        f'<animateTransform attributeName="transform" type="rotate" from="0 806 {footer_y - 6.5}" to="360 806 {footer_y - 6.5}" '
        'dur="1s" repeatCount="indefinite"/></path>',
    ]
    return svg(width, height, "".join(body), "cache-band: капсула кэша под полем ввода Claude Code")


def states(theme: Theme) -> str:
    rows = [
        (WORKING, "Claude работает", "каждый запрос продлевает кэш заново"),
        (capsule_for(0.83), "Тёплый", "следующий запрос прочитает контекст из кэша"),
        (capsule_for(0.3), "Остывает", "последние 25% TTL — пора дописать"),
        (capsule_for(0.08), "Вот-вот остынет", "тост за 5 минут до конца (при TTL 5 мин — за 1)"),
        (DEAD, "Остыл", "следующий запрос перечитает весь контекст заново"),
        (EMPTY, "Кэша нет", "новая сессия или /clear"),
    ]
    row_height, top = 54, 28
    width, height = 900, top * 2 + row_height * len(rows) - 8
    body = [f'<rect width="{width}" height="{height}" rx="20" fill="{theme.page}"/>']
    for i, (capsule, title, note) in enumerate(rows):
        y = top + i * row_height
        body.append(
            f'<rect x="24" y="{y}" width="852" height="{row_height - 10}" rx="12" fill="{theme.card}" stroke="{theme.card_border}"/>'
        )
        middle = y + (row_height - 10) / 2
        body.append(segments(capsule, theme, 48, middle - 3.5))
        body.append(
            f'<text x="134" y="{middle + 5}" font-family="{FONT}" font-size="14" font-weight="500" '
            f'style="{MONO_DIGITS}" fill="{capsule.percent_color or theme.text}">{capsule.percent}</text>'
        )
        body.append(
            f'<text x="210" y="{middle + 5}" font-family="{FONT}" font-size="15" font-weight="600" fill="{theme.text}">{title}</text>'
        )
        body.append(f'<text x="370" y="{middle + 5}" font-family="{FONT}" font-size="14" fill="{theme.dim}">{note}</text>')
    return svg(width, height, "".join(body), "Состояния капсулы cache-band")


def pane(theme: Theme) -> str:
    rows = [
        ("Состояние", "Тёплый"),
        ("Осталось", "40:12"),
        ("TTL", "1 час · выучен по запросам"),
        ("Последний запрос", "19 мин назад"),
        ("Контекст", "~182k токенов"),
    ]
    capsule = capsule_for(0.67)
    width, height = 900, 330
    card_x, card_w = 190, 520
    body = [
        f'<rect width="{width}" height="{height}" rx="20" fill="{theme.page}"/>',
        f'<rect x="{card_x}" y="24" width="{card_w}" height="282" rx="16" fill="{theme.card}" stroke="{theme.card_border}"/>',
        f'<text x="{card_x + 24}" y="58" font-family="{FONT}" font-size="14" font-weight="600" fill="{theme.dim}">Кэш</text>',
        f'<text x="{card_x + card_w - 24}" y="58" text-anchor="end" font-family="{FONT}" font-size="13" fill="{theme.dim}">/cache</text>',
        segments(capsule, theme, card_x + 24, 88, cells=16, size=1.2),
        f'<text x="{card_x + card_w - 24}" y="104" text-anchor="end" font-family="{FONT}" font-size="30" font-weight="650" '
        f'style="{MONO_DIGITS}" fill="{capsule.color}">{capsule.percent}</text>',
    ]
    for i, (label, value) in enumerate(rows):
        y = 150 + i * 32
        if i:
            body.append(
                f'<line x1="{card_x + 24}" y1="{y - 20}" x2="{card_x + card_w - 24}" y2="{y - 20}" stroke="{theme.card_border}"/>'
            )
        body.append(f'<text x="{card_x + 24}" y="{y}" font-family="{FONT}" font-size="14" fill="{theme.dim}">{label}</text>')
        body.append(
            f'<text x="{card_x + card_w - 24}" y="{y}" text-anchor="end" font-family="{FONT}" font-size="14" '
            f'style="{MONO_DIGITS}" fill="{theme.text}">{value}</text>'
        )
    return svg(width, height, "".join(body), "Панель подробностей /cache")


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    for theme in (DARK, LIGHT):
        for name, render in (("hero", hero), ("states", states), ("pane", pane)):
            (ASSETS_DIR / f"{name}-{theme.name}.svg").write_text(render(theme), encoding="utf-8", newline="\n")
    print(f"Assets written to {ASSETS_DIR}")


if __name__ == "__main__":
    main()
