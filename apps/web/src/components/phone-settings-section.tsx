import { zodResolver } from '@hookform/resolvers/zod';
import type { PhoneDeviceInfo, PhoneSettings, SettingsOverview } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  RefreshCw,
  Smartphone,
  Unplug,
  Wifi,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { GhostButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { settingsQuery } from '@/lib/queries';

const connectSchema = z.object({
  address: z.string().trim().min(1, '请填写 IP:端口').max(120, '地址过长'),
});

const pairSchema = z.object({
  address: z.string().trim().min(1, '请填写配对地址').max(120, '地址过长'),
  code: z.string().trim().regex(/^\d{6}$/, '配对码是 6 位数字'),
});

type ConnectValues = z.infer<typeof connectSchema>;
type PairValues = z.infer<typeof pairSchema>;

interface PhoneSettingsSectionProps {
  phone: PhoneSettings;
}

/**
 * Wireless ADB console: lists connected devices, pairs a new phone, and
 * disconnects one; all actions write back into the shared settings query.
 */
export function PhoneSettingsSection({ phone }: PhoneSettingsSectionProps) {
  const queryClient = useQueryClient();
  const connectForm = useForm<ConnectValues>({
    resolver: zodResolver(connectSchema),
    defaultValues: { address: '' },
  });
  const pairForm = useForm<PairValues>({
    resolver: zodResolver(pairSchema),
    defaultValues: { address: '', code: '' },
  });

  /** Patches only the phone slice of the cached settings overview, so no refetch is needed; a no-op on an empty cache. */
  const applyPhone = (next: PhoneSettings) => {
    queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
      current ? { ...current, phone: next } : current,
    );
  };

  const connect = useMutation({
    mutationFn: api.connectPhone,
    onSuccess: (result) => {
      applyPhone(result.phone);
      connectForm.reset();
      toast.success('手机已连接');
    },
    onError: (error) => {
      applyApiFieldErrors(connectForm.setError, error, ['address']);
      toast.error(error instanceof ApiError ? error.message : '连接手机失败');
    },
  });

  const pair = useMutation({
    mutationFn: api.pairPhone,
    onSuccess: (result) => {
      applyPhone(result.phone);
      pairForm.reset();
      toast.success('配对成功；再填无线调试的 IP:端口 连接');
    },
    onError: (error) => {
      applyApiFieldErrors(pairForm.setError, error, ['address', 'code']);
      toast.error(error instanceof ApiError ? error.message : '无线配对失败');
    },
  });

  const disconnect = useMutation({
    mutationFn: api.disconnectPhone,
    onSuccess: (result) => {
      applyPhone(result.phone);
      toast.success('已断开无线设备');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '断开失败');
    },
  });

  const connectErrors = connectForm.formState.errors;
  const pairErrors = pairForm.formState.errors;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-jade-300">
            <Smartphone className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              手机控制
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              {'只支持无线 ADB：先在手机开发者选项里打开无线调试并完成配对，再连接地址。连接成功后，到渠道人格面板 → 心智设置里为每个渠道选择设备。'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {phone.devices.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-jade-300">
              <CheckCircle2 className="size-3" />
              {phone.devices.length} online
            </span>
          ) : phone.adbAvailable ? (
            <span className="rounded-full border border-mist-100/15 bg-mist-100/[0.04] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-400">
              Not connected
            </span>
          ) : (
            <span className="rounded-full border border-signal-400/25 bg-signal-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-signal-400">
              No adb
            </span>
          )}
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey })}
            className="rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
            aria-label="刷新设备"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {!phone.adbAvailable ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-signal-400/20 bg-signal-400/[0.04] p-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-signal-400" />
          <div className="text-[0.78rem] leading-6 text-mist-400">
            <p className="text-signal-300">没有找到可用的 adb</p>
            <p className="mt-1">
              {'安装 Android SDK Platform-Tools，或设置 ADB_PATH / ANDROID_HOME 后刷新。'}
            </p>
            {phone.error && <p className="mt-1 font-mono text-[0.68rem] text-mist-600">{phone.error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.66rem] text-mist-600">
            <span>{phone.adbVersion || 'adb'}</span>
            <span className="max-w-full truncate">{phone.adbPath}</span>
          </div>

          <div className="mt-5 space-y-2">
            {phone.devices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-mist-100/10 px-4 py-5 text-center text-[0.78rem] text-mist-500">
                没有发现无线设备。先在手机上打开无线调试，再填写下面的 IP:端口 连接。
              </p>
            ) : (
              phone.devices.map((device) => (
                <DeviceRow
                  key={device.serial}
                  device={device}
                  pending={disconnect.isPending}
                  onDisconnect={() => disconnect.mutate({ address: device.serial })}
                />
              ))
            )}
          </div>

          <form
            className="mt-6 grid gap-4 border-t border-mist-100/[0.06] pt-5 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={connectForm.handleSubmit((values) => connect.mutate(values))}
            noValidate
          >
            <Field
              label="无线调试地址"
              htmlFor="settings-phone-address"
              hint="IP:端口，例如 192.168.1.23:37105"
              error={connectErrors.address?.message}
            >
              <InputShell
                icon={<Wifi className="size-4" strokeWidth={1.7} />}
                invalid={Boolean(connectErrors.address)}
              >
                <input
                  id="settings-phone-address"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="192.168.1.23:37105"
                  {...connectForm.register('address')}
                />
              </InputShell>
            </Field>
            <GhostButton type="submit" disabled={connect.isPending} className="h-12 px-5">
              <Link2 className="size-4" />
              {connect.isPending ? '连接中' : '连接'}
            </GhostButton>
          </form>

          <details className="mt-4 rounded-xl border border-mist-100/[0.06] px-4 py-3">
            <summary className="cursor-pointer text-[0.72rem] text-mist-400 transition hover:text-mist-200">
              首次无线连接需要先配对
            </summary>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end"
              onSubmit={pairForm.handleSubmit((values) => pair.mutate(values))}
              noValidate
            >
              <Field
                label="配对地址"
                htmlFor="settings-phone-pair-address"
                error={pairErrors.address?.message}
              >
                <InputShell
                  icon={<Wifi className="size-4" strokeWidth={1.7} />}
                  invalid={Boolean(pairErrors.address)}
                >
                  <input
                    id="settings-phone-pair-address"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="配对对话框里的 IP:端口"
                    {...pairForm.register('address')}
                  />
                </InputShell>
              </Field>
              <Field
                label="配对码"
                htmlFor="settings-phone-pair-code"
                error={pairErrors.code?.message}
              >
                <InputShell invalid={Boolean(pairErrors.code)}>
                  <input
                    id="settings-phone-pair-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="6 位数字"
                    {...pairForm.register('code')}
                  />
                </InputShell>
              </Field>
              <GhostButton type="submit" disabled={pair.isPending} className="h-12 px-4">
                {pair.isPending ? '配对中' : '配对'}
              </GhostButton>
            </form>
          </details>

          <div className="mt-5 border-t border-mist-100/[0.06] pt-5">
            <p className="text-[0.68rem] leading-5 text-mist-600">
              连接成功后，到渠道人格面板 → 心智设置 → 手机设备里为每个渠道选择要操作的设备。输入只支持英文、数字和符号。
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/** One connected device line with its state badge and disconnect action. */
function DeviceRow({
  device,
  pending,
  onDisconnect,
}: {
  device: PhoneDeviceInfo;
  pending: boolean;
  onDisconnect: () => void;
}) {
  const online = device.state === 'device';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-[0.76rem] text-mist-100">{device.serial}</span>
          <span
            className={[
              'rounded-full border px-2 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.12em]',
              online
                ? 'border-jade-400/25 text-jade-300'
                : device.state === 'unauthorized'
                  ? 'border-signal-400/25 text-signal-400'
                  : 'border-mist-100/10 text-mist-500',
            ].join(' ')}
          >
            {device.state === 'device'
              ? 'online'
              : device.state === 'unauthorized'
                ? 'unauthorized'
                : device.state}
          </span>
          <span className="rounded-full border border-mist-100/10 px-2 py-0.5 text-[0.56rem] text-mist-500">
            无线
          </span>
        </div>
        <p className="mt-1 truncate text-[0.7rem] text-mist-600">
          {[device.model, device.product].filter(Boolean).join(' · ') || '安卓设备'}
        </p>
        {device.state === 'unauthorized' && (
          <p className="mt-1 text-[0.68rem] text-signal-400">请在手机上确认无线调试授权</p>
        )}
      </div>
      <GhostButton
        type="button"
        disabled={pending}
        onClick={onDisconnect}
        className="h-8 border-signal-400/20 px-3 text-[0.7rem] text-signal-300 hover:border-signal-400/40"
      >
        <Unplug className="size-3.5" />
        {pending ? '断开中' : '断开'}
      </GhostButton>
    </div>
  );
}
