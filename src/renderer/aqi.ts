/** US AQI presentation (EPA six-category color bands). */
export interface AqiPresentation {
  label: string;
  level: string;
  color: string;
  textColor: string;
}

export function getAqiPresentation(value: number | null | undefined): AqiPresentation {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return { label: '—', level: '暂无数据', color: '#9AA8B6', textColor: '#9AA8B6' };
  }
  if (value <= 50) return { label: '优', level: '优', color: '#00E400', textColor: '#00B83A' };
  if (value <= 100) return { label: '良', level: '良', color: '#FFFF00', textColor: '#A88700' };
  if (value <= 150) return { label: '轻度污染', level: '轻度污染', color: '#FF7E00', textColor: '#E36B00' };
  if (value <= 200) return { label: '中度污染', level: '中度污染', color: '#FF0000', textColor: '#E02030' };
  if (value <= 300) return { label: '重度污染', level: '重度污染', color: '#8F3F97', textColor: '#A34EAD' };
  return { label: '严重污染', level: '严重污染', color: '#7E0023', textColor: '#9A2949' };
}
