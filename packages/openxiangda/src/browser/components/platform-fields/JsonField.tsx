import { CheckCircleOutlined, FormatPainterOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Space } from 'antd';
import { useEffect, useState } from 'react';

function stringify(value: unknown) {
  if (value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

export function parseJsonEditorValue(value: string) {
  const text = value.trim();
  return text ? JSON.parse(text) : undefined;
}

export function JsonValueDisplay({ value }: { value: unknown }) {
  return <pre className="oxa-json-value">{stringify(value)}</pre>;
}

export function JsonField({
  value,
  onChange,
  disabled = false,
  mobile = false,
}: {
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  mobile?: boolean;
}) {
  const [draft, setDraft] = useState(() => stringify(value));
  const [error, setError] = useState('');

  useEffect(() => setDraft(stringify(value)), [value]);

  const validate = (next: string) => {
    setDraft(next);
    try {
      const parsed = parseJsonEditorValue(next);
      setError('');
      onChange?.(parsed);
      return parsed;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 格式无效');
      return undefined;
    }
  };

  return (
    <div className={`oxa-json-field${mobile ? ' oxa-mobile-json-field' : ''}`}>
      <Input.TextArea
        autoSize={{ minRows: mobile ? 8 : 6, maxRows: 18 }}
        disabled={disabled}
        onChange={event => validate(event.target.value)}
        placeholder='例如：{"enabled": true}'
        spellCheck={false}
        value={draft}
      />
      <Space>
        <Button
          disabled={disabled || Boolean(error) || !draft.trim()}
          icon={<FormatPainterOutlined />}
          onClick={() => {
            const parsed = validate(draft);
            if (parsed !== undefined) setDraft(stringify(parsed));
          }}
          size="small"
        >
          格式化
        </Button>
        {!error && draft.trim() && (
          <span className="oxa-json-valid"><CheckCircleOutlined /> 格式有效</span>
        )}
      </Space>
      {error && <Alert showIcon title={`JSON 格式无效：${error}`} type="error" />}
    </div>
  );
}
