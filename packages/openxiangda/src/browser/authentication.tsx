import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react';
import type {
  ApplicationAuthenticationMethodV2,
  ApplicationLoginErrorV2,
  ApplicationLoginMethodDescriptorV2,
} from 'openxiangda-contracts/browser';
import {
  OpenXiangdaPlatformRequestError,
  createApplicationLoginTransaction,
  completeApplicationDingTalkJsapi,
  loadApplicationLoginSurface,
  passwordLoginApplication,
  startApplicationDingTalk,
  startApplicationSso,
} from './platform-client';

export type ApplicationLoginSurfaceState =
  | 'idle'
  | 'submitting'
  | 'redirecting'
  | 'recovering-identity';

export interface ApplicationLoginSurfaceProps {
  app: { code: string; name: string };
  device: 'desktop' | 'mobile';
  methods: readonly ApplicationLoginMethodDescriptorV2[];
  state: ApplicationLoginSurfaceState;
  error: ApplicationLoginErrorV2 | null;
  returnTo: string;
  passwordLogin(input: {
    username: string;
    password: string;
    rememberAccount?: boolean;
    challengeId?: string;
    challengeAnswer?: string;
  }): Promise<void>;
  startSso(methodCode: string): Promise<void>;
  startDingTalk(methodCode: string): Promise<void>;
  clearError(): void;
}

export type ApplicationLoginSurfaceComponent =
  ComponentType<ApplicationLoginSurfaceProps>;

export interface GeneratedApplicationAuthenticationSurface {
  device: 'desktop' | 'mobile';
  routeCode: string;
  path: string;
  defaultRouteCode: string;
}

export interface ApplicationAuthenticationSurfaceContribution {
  surface: Readonly<GeneratedApplicationAuthenticationSurface>;
  component: ApplicationLoginSurfaceComponent;
}

export interface ApplicationLoginControllerProps {
  app: { code: string; name: string };
  contribution: ApplicationAuthenticationSurfaceContribution;
  returnTo: string;
  onAuthenticated(redirectTo: string): Promise<void> | void;
}

function safeLoginError(error: unknown): ApplicationLoginErrorV2 {
  if (error instanceof OpenXiangdaPlatformRequestError) {
    const data =
      error.data && typeof error.data === 'object' && !Array.isArray(error.data)
        ? (error.data as Partial<ApplicationLoginErrorV2>)
        : {};
    return {
      code: (data.code || error.code) as ApplicationLoginErrorV2['code'],
      message: data.message || '登录暂时失败，请稍后重试',
      retryable: data.retryable ?? error.status >= 500,
      ...(data.methodCode ? { methodCode: data.methodCode } : {}),
      ...(data.retryAfterSeconds
        ? { retryAfterSeconds: data.retryAfterSeconds }
        : {}),
      ...(data.challenge ? { challenge: data.challenge } : {}),
      ...(data.requestId ? { requestId: data.requestId } : {}),
    };
  }
  return {
    code: 'APPLICATION_AUTH_TEMPORARILY_UNAVAILABLE',
    message: '登录服务暂时不可用，请检查网络后重试',
    retryable: true,
  };
}

export function ApplicationLoginController({
  app,
  contribution,
  returnTo,
  onAuthenticated,
}: ApplicationLoginControllerProps) {
  const { component: Component, surface } = contribution;
  const [methods, setMethods] = useState<
    readonly ApplicationLoginMethodDescriptorV2[]
  >([]);
  const [normalizedReturnTo, setNormalizedReturnTo] = useState(returnTo);
  const [state, setState] = useState<ApplicationLoginSurfaceState>('recovering-identity');
  const [error, setError] = useState<ApplicationLoginErrorV2 | null>(null);

  useEffect(() => {
    let active = true;
    setState('recovering-identity');
    setError(null);
    void loadApplicationLoginSurface({
      device: surface.device,
      returnTo,
    }).then(
      publicSurface => {
        if (!active) return;
        setMethods(publicSurface.methods);
        setNormalizedReturnTo(publicSurface.returnTo);
        setState('idle');
      },
      reason => {
        if (!active) return;
        setError(safeLoginError(reason));
        setState('idle');
      },
    );
    return () => {
      active = false;
    };
  }, [returnTo, surface.device]);

  const requireMethod = useCallback(
    (methodCode: string, type: ApplicationAuthenticationMethodV2['type']) => {
      const method = methods.find(item => item.code === methodCode);
      if (!method || method.type !== type || !method.available) {
        throw new OpenXiangdaPlatformRequestError({
          code: 'APPLICATION_AUTH_PROVIDER_UNAVAILABLE',
          status: 503,
          message: '该登录方式当前不可用',
          data: {
            code: 'APPLICATION_AUTH_PROVIDER_UNAVAILABLE',
            message: '该登录方式当前不可用',
            retryable: true,
            methodCode,
          },
        });
      }
      return method;
    },
    [methods],
  );

  const createTransaction = useCallback(
    async () =>
      await createApplicationLoginTransaction({
        device: surface.device,
        returnTo: normalizedReturnTo,
      }),
    [normalizedReturnTo, surface.device],
  );

  const passwordLogin = useCallback(
    async (input: {
      username: string;
      password: string;
      rememberAccount?: boolean;
      challengeId?: string;
      challengeAnswer?: string;
    }) => {
      if (state !== 'idle') return;
      setError(null);
      setState('submitting');
      try {
        const method = methods.find(item => item.type === 'password');
        requireMethod(method?.code || '', 'password');
        const transaction = await createTransaction();
        const receipt = await passwordLoginApplication({
          transactionId: transaction.transactionId,
          methodCode: method!.code,
          ...input,
        });
        setState('recovering-identity');
        await onAuthenticated(receipt.redirectTo);
      } catch (reason) {
        setError(safeLoginError(reason));
        setState('idle');
      }
    },
    [createTransaction, methods, onAuthenticated, requireMethod, state],
  );

  const startRedirect = useCallback(
    async (methodCode: string, type: 'sso' | 'dingtalk') => {
      if (state !== 'idle') return;
      setError(null);
      setState('redirecting');
      try {
        requireMethod(methodCode, type);
        const transaction = await createTransaction();
        const receipt =
          type === 'sso'
            ? await startApplicationSso({
                transactionId: transaction.transactionId,
                methodCode,
              })
            : await startApplicationDingTalk({
                transactionId: transaction.transactionId,
                methodCode,
                jsapiAvailable: Boolean(
                  (window as unknown as {
                    dd?: {
                      runtime?: {
                        permission?: { requestAuthCode?: unknown };
                      };
                    };
                  }).dd?.runtime?.permission?.requestAuthCode,
                ),
              });
        if (receipt.flow === 'jsapi') {
          const runtime = (window as unknown as {
            dd?: {
              runtime?: {
                permission?: {
                  requestAuthCode?: (input: {
                    corpId: string;
                    onSuccess(result: { code?: string }): void;
                    onFail(error: unknown): void;
                  }) => void;
                };
              };
            };
          }).dd?.runtime?.permission?.requestAuthCode;
          if (!runtime || !receipt.jsapi?.corpId) {
            throw new OpenXiangdaPlatformRequestError({
              code: 'APPLICATION_AUTH_PROVIDER_UNAVAILABLE',
              status: 503,
              message: '当前钉钉容器不支持免登',
            });
          }
          const code = await new Promise<string>((resolve, reject) =>
            runtime({
              corpId: receipt.jsapi!.corpId,
              onSuccess: result =>
                result.code
                  ? resolve(result.code)
                  : reject(new Error('APPLICATION_AUTH_DINGTALK_CODE_REQUIRED')),
              onFail: reject,
            }),
          );
          const session = await completeApplicationDingTalkJsapi({
            transactionId: transaction.transactionId,
            methodCode,
            code,
          });
          setState('recovering-identity');
          await onAuthenticated(session.redirectTo);
          return;
        }
        if (!receipt.redirectUrl) {
          throw new Error('APPLICATION_AUTH_REDIRECT_URL_REQUIRED');
        }
        window.location.assign(receipt.redirectUrl);
      } catch (reason) {
        setError(safeLoginError(reason));
        setState('idle');
      }
    },
    [createTransaction, onAuthenticated, requireMethod, state],
  );

  const props = useMemo<ApplicationLoginSurfaceProps>(
    () => ({
      app,
      device: surface.device,
      methods,
      state,
      error,
      returnTo: normalizedReturnTo,
      passwordLogin,
      startSso: methodCode => startRedirect(methodCode, 'sso'),
      startDingTalk: methodCode => startRedirect(methodCode, 'dingtalk'),
      clearError: () => setError(null),
    }),
    [
      app,
      error,
      methods,
      normalizedReturnTo,
      passwordLogin,
      startRedirect,
      state,
      surface.device,
    ],
  );

  return <Component {...props} />;
}

function DefaultApplicationLoginSurface({
  app,
  device,
  methods,
  state,
  error,
  passwordLogin,
  startSso,
  startDingTalk,
}: ApplicationLoginSurfaceProps) {
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const pending = state !== 'idle';
  const passwordMethod = methods.find(method => method.type === 'password');
  return (
    <main
      className={`oxa-application-login oxa-application-login--${device}`}
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: device === 'mobile' ? 20 : 48,
      }}
    >
      <Card style={{ width: '100%', maxWidth: device === 'mobile' ? 420 : 480 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={2}>{app.name}</Typography.Title>
            <Typography.Text type="secondary">请选择登录方式</Typography.Text>
          </div>
          {error ? <Alert role="alert" type="error" showIcon message={error.message} /> : null}
          {methods
            .filter(method => method.presentation === 'primary')
            .map(method => (
              <Button
                block
                disabled={!method.available || pending}
                key={method.code}
                loading={state === 'redirecting'}
                onClick={() =>
                  method.type === 'sso'
                    ? void startSso(method.code)
                    : method.type === 'dingtalk'
                      ? void startDingTalk(method.code)
                      : setPasswordExpanded(true)
                }
                type="primary"
              >
                {method.label}
              </Button>
            ))}
          {passwordExpanded && passwordMethod ? (
            <Form
              layout="vertical"
              onFinish={values =>
                void passwordLogin({
                  ...values,
                  ...(error?.challenge
                    ? { challengeId: error.challenge.id }
                    : {}),
                })
              }
              requiredMark={false}
            >
              <Form.Item label="账号" name="username" rules={[{ required: true }]}>
                <Input autoComplete="username" />
              </Form.Item>
              <Form.Item label="密码" name="password" rules={[{ required: true }]}>
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              {error?.challenge ? (
                <Form.Item
                  label={error.challenge.question}
                  name="challengeAnswer"
                  rules={[{ required: true, message: '请输入验证码答案' }]}
                >
                  <Input autoComplete="off" />
                </Form.Item>
              ) : null}
              <Button block htmlType="submit" loading={state === 'submitting'} type="primary">
                登录
              </Button>
            </Form>
          ) : null}
          <Space wrap>
            {methods
              .filter(method => method.presentation === 'secondary')
              .map(method => (
                <Button
                  disabled={!method.available || pending}
                  key={method.code}
                  onClick={() => {
                    if (method.type === 'password') setPasswordExpanded(true);
                    else if (method.type === 'sso') void startSso(method.code);
                    else void startDingTalk(method.code);
                  }}
                  type="link"
                >
                  {method.label}
                </Button>
              ))}
          </Space>
        </Space>
      </Card>
    </main>
  );
}

export const DefaultDesktopApplicationLoginSurface: ApplicationLoginSurfaceComponent =
  props => <DefaultApplicationLoginSurface {...props} device="desktop" />;

export const DefaultMobileApplicationLoginSurface: ApplicationLoginSurfaceComponent =
  props => <DefaultApplicationLoginSurface {...props} device="mobile" />;
