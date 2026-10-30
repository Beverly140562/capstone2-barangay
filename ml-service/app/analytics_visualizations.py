
import io
import math
from html import escape


WIDTH = 800
HEIGHT = 450


def _number(value):
    try:
        if value is None:
            return None
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _svg_start(title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
        width="{WIDTH}" height="{HEIGHT}"
        viewBox="0 0 {WIDTH} {HEIGHT}">
        <rect width="100%" height="100%" fill="white"/>
        <text x="400" y="38" text-anchor="middle"
            font-family="Arial" font-size="21" font-weight="bold">
            {escape(str(title))}
        </text>'''


def _svg_end():
    return "</svg>"


def _image(svg):
    return io.BytesIO(svg.encode("utf-8"))


def create_vulnerability_chart(records):
    counts = {}

    for row in records:
        label = str(row.get("vulnerability") or "Not Classified")
        counts[label] = counts.get(label, 0) + 1

    svg = _svg_start("Household Vulnerability Distribution")

    if not counts:
        svg += '<text x="400" y="220" text-anchor="middle">No data available</text>'
        return _image(svg + _svg_end())

    maximum = max(counts.values()) or 1
    chart_left = 210
    chart_width = 480
    bar_height = 42
    gap = 24

    for index, (label, count) in enumerate(sorted(counts.items())):
        y = 95 + index * (bar_height + gap)
        bar_width = count / maximum * chart_width

        svg += f'''
        <text x="190" y="{y + 27}" text-anchor="end"
            font-family="Arial" font-size="15">{escape(label)}</text>
        <rect x="{chart_left}" y="{y}" width="{bar_width:.2f}"
            height="{bar_height}" fill="#6E2430" rx="5"/>
        <text x="{chart_left + bar_width + 10}" y="{y + 27}"
            font-family="Arial" font-size="15">{count}</text>
        '''

    return _image(svg + _svg_end())


def create_income_chart(records):
    values = [
        value for value in
        (_number(row.get("monthly_income")) for row in records)
        if value is not None
    ]

    svg = _svg_start("Household Monthly Income Distribution")

    if not values:
        svg += '<text x="400" y="220" text-anchor="middle">No income data available</text>'
        return _image(svg + _svg_end())

    minimum = min(values)
    maximum = max(values)
    bins = 10

    if minimum == maximum:
        counts = [0] * bins
        counts[0] = len(values)
    else:
        counts = [0] * bins
        for value in values:
            index = int((value - minimum) / (maximum - minimum) * bins)
            index = min(index, bins - 1)
            counts[index] += 1

    max_count = max(counts) or 1
    chart_x = 90
    chart_y = 100
    chart_width = 620
    chart_height = 250
    bar_width = chart_width / bins

    for index, count in enumerate(counts):
        height = count / max_count * chart_height
        x = chart_x + index * bar_width
        y = chart_y + chart_height - height

        svg += f'''
        <rect x="{x + 3:.2f}" y="{y:.2f}"
            width="{bar_width - 6:.2f}" height="{height:.2f}"
            fill="#6E2430"/>
        <text x="{x + bar_width / 2:.2f}"
            y="{chart_y + chart_height + 22}"
            text-anchor="middle" font-family="Arial"
            font-size="12">{count}</text>
        '''

    svg += f'''
    <text x="400" y="405" text-anchor="middle"
        font-family="Arial" font-size="14">
        Monthly income range: {minimum:,.0f} - {maximum:,.0f}
    </text>
    '''

    return _image(svg + _svg_end())


def create_feature_relationship_chart(records):
    features = [
        "monthly_income",
        "family_number",
        "age",
        "length_residency",
        "member_count",
        "family_size",
    ]

    available = [
        feature for feature in features
        if any(_number(row.get(feature)) is not None for row in records)
    ]

    svg = _svg_start("Household Feature Relationships")

    if len(available) < 2:
        svg += '<text x="400" y="220" text-anchor="middle">Insufficient numeric data</text>'
        return _image(svg + _svg_end())

    data = {
        feature: [_number(row.get(feature)) for row in records]
        for feature in available
    }

    def correlation(a, b):
        pairs = [
            (x, y) for x, y in zip(data[a], data[b])
            if x is not None and y is not None
        ]

        if len(pairs) < 2:
            return None

        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]

        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)

        numerator = sum(
            (x - mean_x) * (y - mean_y)
            for x, y in pairs
        )

        denominator_x = sum((x - mean_x) ** 2 for x in xs)
        denominator_y = sum((y - mean_y) ** 2 for y in ys)

        denominator = math.sqrt(denominator_x * denominator_y)

        if denominator == 0:
            return None

        return numerator / denominator

    cell = min(65, 330 // len(available))
    left = 220
    top = 100

    for i, first in enumerate(available):
        y = top + i * cell

        svg += f'''
        <text x="{left - 12}" y="{y + cell / 2 + 5}"
            text-anchor="end" font-family="Arial"
            font-size="12">{escape(first)}</text>
        '''

        for j, second in enumerate(available):
            x = left + j * cell
            value = correlation(first, second)

            if value is None:
                fill = "#EEEEEE"
                label = "N/A"
            else:
                intensity = int(255 * (1 - abs(value)))
                if value >= 0:
                    fill = f"rgb(255,{intensity},{intensity})"
                else:
                    fill = f"rgb({intensity},{intensity},255)"
                label = f"{value:.2f}"

            svg += f'''
            <rect x="{x}" y="{y}" width="{cell - 2}"
                height="{cell - 2}" fill="{fill}"
                stroke="#999999"/>
            <text x="{x + (cell - 2) / 2}"
                y="{y + cell / 2 + 5}"
                text-anchor="middle" font-family="Arial"
                font-size="12">{label}</text>
            '''

    for j, feature in enumerate(available):
        x = left + j * cell + cell / 2
        svg += f'''
        <text x="{x}" y="{top - 12}"
            text-anchor="middle" font-family="Arial"
            font-size="11">{escape(feature)}</text>
        '''

    return _image(svg + _svg_end())
