export interface ClarificationQuestion {
  id: string;
  question: string;
  type: 'number' | 'choice' | 'text';
  options?: string[];
  defaultValue?: unknown;
  parameterName: string;
}

export function detectMissingParameters(
  visualizationType: string,
  extractedParameters: Record<string, unknown>
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  if (visualizationType === 'projectile_motion') {
    if (!extractedParameters.v0) {
      questions.push({
        id: 'v0',
        question: '请输入初速度 v₀ (m/s)',
        type: 'number',
        defaultValue: 20,
        parameterName: 'v0',
      });
    }

    if (!extractedParameters.angle_deg) {
      questions.push({
        id: 'angle',
        question: '请输入发射角度 θ (度)',
        type: 'number',
        defaultValue: 45,
        parameterName: 'angle_deg',
      });
    }

    if (!extractedParameters.g) {
      questions.push({
        id: 'g',
        question: '重力加速度 g',
        type: 'choice',
        options: ['9.8 m/s² (地球)', '10 m/s² (近似)', '1.6 m/s² (月球)'],
        defaultValue: 9.8,
        parameterName: 'g',
      });
    }
  }

  if (visualizationType === 'force_diagram') {
    if (!extractedParameters.mass) {
      questions.push({
        id: 'mass',
        question: '请输入物体质量 m (kg)',
        type: 'number',
        defaultValue: 5,
        parameterName: 'mass',
      });
    }

    if (!extractedParameters.angle) {
      questions.push({
        id: 'incline_angle',
        question: '请输入斜面角度 (度)',
        type: 'number',
        defaultValue: 30,
        parameterName: 'angle',
      });
    }
  }

  if (visualizationType === 'function_graph') {
    if (!extractedParameters.xMin) {
      questions.push({
        id: 'xMin',
        question: 'x轴最小值',
        type: 'number',
        defaultValue: -10,
        parameterName: 'xMin',
      });
    }

    if (!extractedParameters.xMax) {
      questions.push({
        id: 'xMax',
        question: 'x轴最大值',
        type: 'number',
        defaultValue: 10,
        parameterName: 'xMax',
      });
    }
  }

  return questions;
}

export function parseUserResponse(
  question: ClarificationQuestion,
  response: string | number
): unknown {
  if (question.type === 'number') {
    const num = typeof response === 'number' ? response : parseFloat(String(response));
    return isNaN(num) ? question.defaultValue : num;
  }

  if (question.type === 'choice' && question.options) {
    // Extract number from choice (e.g., "9.8 m/s² (地球)" -> 9.8)
    const match = String(response).match(/[\d.]+/);
    return match ? parseFloat(match[0]) : question.defaultValue;
  }

  return response;
}
