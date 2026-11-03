import io
import math
from html import escape

import pandas as pd
import matplotlib

# Use a non-interactive backend for the Render server.
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import seaborn as sns

WIDTH = 800
HEIGHT = 550


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
            font-family="Arial" font-size="18">{escape(label)}</text>
        <rect x="{chart_left}" y="{y}" width="{bar_width:.2f}"
            height="{bar_height}" fill="#6E2430" rx="5"/>
        <text x="{chart_left + bar_width + 10}" y="{y + 27}"
            font-family="Arial" font-size="18">{count}</text>
        '''

    return _image(svg + _svg_end())



def create_income_chart(records):
    values = []

    for row in records or []:
        value = _number(row.get("household_monthly_income"))

        if value is not None and value >= 0:
            values.append(value)

    title = "Household Monthly Income Distribution"
    svg = _svg_start(title)

    if not values:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No income data available
        </text>
        '''
        return _image(svg + _svg_end())

    chart_left = 100
    chart_top = 100
    chart_width = 620
    chart_height = 320

    minimum = min(values)
    maximum = max(values)

    # Give identical values a visible plotting range.
    if minimum == maximum:
        padding = max(minimum * 0.10, 1000)
        minimum = max(0, minimum - padding)
        maximum = maximum + padding

    bin_count = min(10, max(1, len(values)))
    bin_width = (maximum - minimum) / bin_count

    counts = [0] * bin_count

    for value in values:
        index = int((value - minimum) / bin_width)
        index = min(index, bin_count - 1)
        counts[index] += 1

    maximum_count = max(counts) or 1
    bar_width = chart_width / bin_count

    svg += f'''
    <line x1="{chart_left}" y1="{chart_top + chart_height}"
          x2="{chart_left + chart_width}"
          y2="{chart_top + chart_height}"
          stroke="#333" stroke-width="2"/>
    <line x1="{chart_left}" y1="{chart_top}"
          x2="{chart_left}" y2="{chart_top + chart_height}"
          stroke="#333" stroke-width="2"/>
    '''

    for index, count in enumerate(counts):
        bar_height = count / maximum_count * chart_height
        x = chart_left + index * bar_width
        y = chart_top + chart_height - bar_height

        svg += f'''
        <rect x="{x + 2}" y="{y}"
              width="{max(0, bar_width - 4)}"
              height="{bar_height}"
              fill="#6E2430" rx="3"/>
        <text x="{x + bar_width / 2}"
              y="{chart_top + chart_height + 25}"
              text-anchor="middle"
              font-family="Arial" font-size="11">
            {index + 1}
        </text>
        '''

    svg += f'''
    <text x="410" y="500" text-anchor="middle"
          font-family="Arial" font-size="15">
        Income range: ₱{minimum:,.0f} – ₱{maximum:,.0f}
    </text>
    <text x="25" y="260" text-anchor="middle"
          transform="rotate(-90 25 260)"
          font-family="Arial" font-size="14">
        Number of households
    </text>
    <text x="410" y="535" text-anchor="middle"
          font-family="Arial" font-size="13">
        Income groups (₱)
    </text>
    <text x="400" y="75" text-anchor="middle"
          font-family="Arial" font-size="13">
        {len(values)} households
    </text>
    '''

    return _image(svg + _svg_end())


def create_feature_relationship_chart(records):
    """
    Shows the relationship between household size
    and household monthly income.

    member_count is used as household size because
    the household dataset audit confirmed that
    declared family size matches member records.
    """

    points = []

    for row in records or []:
        family_size = _number(row.get("member_count"))
        income = _number(row.get("household_monthly_income"))

        if (
            family_size is not None
            and income is not None
            and family_size >= 0
            and income >= 0
        ):
            points.append((family_size, income))

    svg = _svg_start("Household Size vs Monthly Income")

    if not points:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No usable household data available
        </text>
        '''
        return _image(svg + _svg_end())

    left = 110
    top = 100
    width = 600
    height = 320

    x_values = [point[0] for point in points]
    y_values = [point[1] for point in points]

    x_min = min(x_values)
    x_max = max(x_values)
    y_min = min(y_values)
    y_max = max(y_values)

    if x_min == x_max:
        x_min = max(0, x_min - 1)
        x_max = x_max + 1

    if y_min == y_max:
        padding = max(y_max * 0.10, 1000)
        y_min = max(0, y_min - padding)
        y_max = y_max + padding

    svg += f'''
    <line x1="{left}" y1="{top + height}"
          x2="{left + width}" y2="{top + height}"
          stroke="#333" stroke-width="2"/>
    <line x1="{left}" y1="{top}"
          x2="{left}" y2="{top + height}"
          stroke="#333" stroke-width="2"/>
    '''

    # Plot each household as one point.
    for family_size, income in points:
        x = left + (
            (family_size - x_min) / (x_max - x_min)
        ) * width

        y = top + height - (
            (income - y_min) / (y_max - y_min)
        ) * height

        svg += f'''
        <circle cx="{x:.2f}" cy="{y:.2f}"
                r="6" fill="#6E2430"
                stroke="white" stroke-width="1.5"/>
        '''

    svg += f'''
    <text x="410" y="465" text-anchor="middle"
          font-family="Arial" font-size="15">
        Household size (number of members)
    </text>

    <text x="25" y="260" text-anchor="middle"
          transform="rotate(-90 25 260)"
          font-family="Arial" font-size="14">
        Household monthly income (₱)
    </text>

    <text x="{left}" y="445"
          font-family="Arial" font-size="12">
        {x_min:g}
    </text>

    <text x="{left + width}" y="445"
          text-anchor="end"
          font-family="Arial" font-size="12">
        {x_max:g}
    </text>

    <text x="{left - 10}" y="{top + height}"
          text-anchor="end"
          font-family="Arial" font-size="12">
        {y_min:,.0f}
    </text>

    <text x="{left - 10}" y="{top + 10}"
          text-anchor="end"
          font-family="Arial" font-size="12">
        {y_max:,.0f}
    </text>

    <text x="400" y="75" text-anchor="middle"
          font-family="Arial" font-size="13">
        {len(points)} households plotted
    </text>
    '''

    return _image(svg + _svg_end())
