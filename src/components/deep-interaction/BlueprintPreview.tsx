'use client';

import type { LearningBlueprint, SchemaValidationSummary } from '@/features/deep-interaction/lib/types';

interface BlueprintPreviewProps {
  blueprint?: LearningBlueprint | null;
  schemaValidation?: SchemaValidationSummary | null;
}

const bloomLabelMap: Record<string, string> = {
  remember: '记忆',
  understand: '理解',
  apply: '应用',
  analyze: '分析',
  evaluate: '评价',
  create: '创造',
};

const scaffoldingLabelMap: Record<string, string> = {
  guided: '强引导',
  open: '开放探索',
  inquiry: '探究式',
};

export default function BlueprintPreview({ blueprint, schemaValidation }: BlueprintPreviewProps) {
  if (!blueprint) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">教学蓝图</div>
        <span className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
          {blueprint.subjectDomain}
        </span>
      </div>

      <div className="space-y-1.5 text-xs leading-relaxed text-slate-600">
        <p><span className="font-bold text-slate-700">主题：</span>{blueprint.topic}</p>
        <p><span className="font-bold text-slate-700">年级：</span>{blueprint.gradeRange[0]}-{blueprint.gradeRange[1]} 年级</p>
        <p><span className="font-bold text-slate-700">认知：</span>{bloomLabelMap[blueprint.bloomLevel] ?? blueprint.bloomLevel}</p>
        <p><span className="font-bold text-slate-700">支架：</span>{scaffoldingLabelMap[blueprint.scaffoldingLevel] ?? blueprint.scaffoldingLevel}</p>
        <p><span className="font-bold text-slate-700">核心洞察：</span>{blueprint.expectedInsight}</p>
      </div>

      {blueprint.coreVariables.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-bold text-slate-700">核心变量</div>
          <div className="flex flex-wrap gap-1.5">
            {blueprint.coreVariables.map((variable) => (
              <span
                key={`${variable.symbol}-${variable.role}`}
                className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-medium text-slate-700"
              >
                {variable.name}({variable.symbol}) · {variable.role}
              </span>
            ))}
          </div>
        </div>
      )}

      {schemaValidation && (
        <div className="mt-3 text-xs leading-relaxed">
          <div className={`font-bold ${schemaValidation.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
            学科校验：{schemaValidation.passed ? '通过' : '有待修正'}
            {schemaValidation.schemaKey ? ` · ${schemaValidation.schemaKey}` : ''}
          </div>
          {schemaValidation.violations.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-amber-700">
              {schemaValidation.violations.slice(0, 3).map((item) => <li key={item}>- {item}</li>)}
            </ul>
          )}
          {schemaValidation.warnings.length > 0 && (
            <p className="mt-1 text-slate-500">{schemaValidation.warnings[0]}</p>
          )}
        </div>
      )}

      {blueprint.knowledgeConstraints.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-bold text-blue-700">
            查看知识约束（{blueprint.knowledgeConstraints.length}）
          </summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {blueprint.knowledgeConstraints.slice(0, 5).map((constraint) => (
              <li key={constraint.id}>- [{constraint.severity}] {constraint.description}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
