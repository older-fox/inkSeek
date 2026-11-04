import type {
  ChatPipelineConfigField,
  ChatPipelineNodeType,
  ChatPipelineVariable,
} from '@inkseek/shared';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PipelineSelectOption } from './pipeline-select';

export interface ProviderOption {
  id: string;
  name: string;
  models: string[];
}

export function useProviderOptions(active: boolean): ProviderOption[] {
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    api
      .personaAiProviders()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setProviders(list.map(({ id, name, models }) => ({ id, name, models })));
      })
      .catch(() => {
        // 读取失败时下拉只剩「自动」项，已保存的值仍会作为自定义项显示。
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return providers;
}

export function dynamicFieldOptions(
  field: ChatPipelineConfigField,
  config: Record<string, unknown>,
  providers: ProviderOption[],
  variables: ChatPipelineVariable[],
): PipelineSelectOption[] | null {
  if (field.optionsSource === 'pipeline-variables') {
    return [
      { value: '', label: '未设置' },
      ...variables.map((variable) => ({ value: variable.key, label: variable.key })),
    ];
  }

  if (field.optionsSource === 'model-providers') {
    return [
      { value: '', label: '自动（首个提供商）' },
      ...providers.map((provider) => ({ value: provider.id, label: provider.name })),
    ];
  }

  if (field.optionsSource === 'provider-models') {
    const scope = config[field.dependsOn ?? 'providerId'];
    const scoped =
      typeof scope === 'string' && scope !== ''
        ? providers.filter((provider) => provider.id === scope)
        : providers;
    const models = [...new Set(scoped.flatMap((provider) => provider.models))];

    return [
      { value: '', label: '自动（该提供商的首个模型）' },
      ...models.map((model) => ({ value: model, label: model })),
    ];
  }

  return null;
}

/** Config writes that drop now-invalid values of fields depending on `field`. */
export function dependentConfigResets(
  definition: ChatPipelineNodeType | null,
  field: ChatPipelineConfigField,
  value: unknown,
  config: Record<string, unknown>,
  providers: ProviderOption[],
  variables: ChatPipelineVariable[],
): Array<{ key: string; value: unknown }> {
  const resets: Array<{ key: string; value: unknown }> = [];

  for (const dependent of definition?.fields ?? []) {
    if (dependent.dependsOn !== field.key) {
      continue;
    }
    const current = config[dependent.key];
    if (typeof current !== 'string' || current === '') {
      continue;
    }
    const options = dynamicFieldOptions(
      dependent,
      { ...config, [field.key]: value },
      providers,
      variables,
    );
    if (options && !options.some((option) => option.value === current)) {
      resets.push({ key: dependent.key, value: '' });
    }
  }

  return resets;
}
