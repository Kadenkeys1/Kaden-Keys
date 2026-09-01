import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';
import { colors } from '../theme/colors';

export default function PriceChart({ history, width, height = 220, lineColor }) {
  if (!history || history.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const padding = 10;

  const points = history
    .map((p, i) => {
      const x = (i / (history.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((p - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const lastPrice = history[history.length - 1];
  const firstPrice = history[0];
  const stroke = lineColor || (lastPrice >= firstPrice ? colors.green : colors.red);

  const lastX = width - padding;
  const lastY =
    height - padding - ((lastPrice - min) / range) * (height - padding * 2);

  return (
    <Svg width={width} height={height}>
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <Line
          key={f}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          stroke={colors.border}
          strokeWidth={1}
        />
      ))}
      <Polyline points={points} fill="none" stroke={stroke} strokeWidth={2} />
      <Circle cx={lastX} cy={lastY} r={4} fill={stroke} />
    </Svg>
  );
}
