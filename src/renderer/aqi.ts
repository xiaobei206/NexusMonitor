/** Provider-aware AQI presentation. CN-MEP and US-EPA share color bands but use different category labels. */
export interface AqiPresentation {
  label: string;
  level: string;
  color: string;
  textColor: string;
}

export function getAqiPresentation(value: number | null | undefined, standard: string | null | undefined = 'US-EPA'): AqiPresentation {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return { label: '—', level: '暂无数据', color: '#9AA8B6', textColor: '#9AA8B6' };
  }
  const china = standard === 'China-MEP';
  if (value <= 50) return { label: china ? '优' : '良好', level: china ? '优' : '良好', color: '#00E400', textColor: '#00B83A' };
  if (value <= 100) return { label: china ? '良' : '中等', level: china ? '良' : '中等', color: '#FFFF00', textColor: '#A88700' };
  if (value <= 150) return { label: china ? '轻度污染' : '敏感人群不健康', level: china ? '轻度污染' : '敏感人群不健康', color: '#FF7E00', textColor: '#E36B00' };
  if (value <= 200) return { label: china ? '中度污染' : '不健康', level: china ? '中度污染' : '不健康', color: '#FF0000', textColor: '#E02030' };
  if (value <= 300) return { label: china ? '重度污染' : '非常不健康', level: china ? '重度污染' : '非常不健康', color: '#8F3F97', textColor: '#A34EAD' };
  return { label: china ? '严重污染' : '危险', level: china ? '严重污染' : '危险', color: '#7E0023', textColor: '#9A2949' };
}
