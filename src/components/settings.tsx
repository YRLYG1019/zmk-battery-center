import React from "react";
import Button from "./button";
import {
  FETCH_INTERVAL_AUTO,
  NotificationType,
  TrayIconComponent,
  MIN_BATTERY_THRESHOLD,
  MAX_BATTERY_THRESHOLD,
  clampBatteryThreshold,
  clampWindowOpacity,
  defaultConfig,
  MIN_WINDOW_OPACITY,
  MAX_WINDOW_OPACITY,
} from "../utils/config";
import { useTheme, type Theme } from "@/providers/theme-provider";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/shadcn/select";
import { Switch } from "@/components/shadcn/switch";
import { XMarkIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useConfigContext } from "@/providers/config-provider";
import TopRightButtons from "./top-right-buttons";
import { platform } from "@tauri-apps/plugin-os";

import { cn } from "@/utils/cn";
import { getLogLevelState, setLogLevel } from "@/utils/diagnostics";
import type { LogLevel } from "@/utils/log";

function LoggingSettings() {
  const [level, setLevel] = React.useState<LogLevel | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void getLogLevelState()
      .then((state) => {
        if (!cancelled) setLevel(state.level);
      })
      .catch(() => {
        if (!cancelled) setError("ログレベルを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsGroup>
      <div className="flex items-center justify-between gap-3">
        <span>ログレベル</span>
        <Select
          value={level ?? ""}
          disabled={busy || level === null}
          onValueChange={(value) =>
            void run(async () => {
              const state = await setLogLevel(value as LogLevel);
              setLevel(state.level);
            })
          }
        >
          <SelectTrigger aria-label="ログレベル" className="w-28">
            <SelectValue placeholder="読み込み中" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="warn">警告</SelectItem>
            <SelectItem value="info">情報</SelectItem>
            <SelectItem value="debug">デバッグ</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </SettingsGroup>
  );
}

type SettingsGroupProps = {
  children: React.ReactNode;
  className?: string;
};

export const SettingsGroup: React.FC<SettingsGroupProps> = ({ children, className }) => (
  <div className={cn("rounded-lg border border-card bg-card/90 p-3", className)}>{children}</div>
);

interface SettingsScreenProps {
  onExit: () => void | Promise<void>;
}

const Dot = () => <span className="mr-1 font-bold">•</span>;

interface BatteryThresholdInputProps {
  value: number;
  disabled: boolean;
  disabledTitle?: string;
  fallback: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
}

function BatteryThresholdInput({
  value,
  disabled,
  disabledTitle,
  fallback,
  min = MIN_BATTERY_THRESHOLD,
  max = MAX_BATTERY_THRESHOLD,
  onCommit,
  ariaLabel,
}: BatteryThresholdInputProps) {
  const [draft, setDraft] = React.useState<string>(String(value));
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(String(value));
  }

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    const next = clampBatteryThreshold(parsed, fallback, { min, max });
    setDraft(String(next));
    if (next !== value) {
      onCommit(next);
    }
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      title={disabled ? disabledTitle : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "mx-1 h-7 w-12 rounded border border-input bg-background px-1 text-center text-sm",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    />
  );
}

interface WindowOpacitySliderProps {
  value: number;
  onCommit: (value: number) => void;
}

function WindowOpacitySlider({ value, onCommit }: WindowOpacitySliderProps) {
  const [draft, setDraft] = React.useState(value);
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(value);
  }

  // Preview the opacity while dragging; the config is saved on release.
  const preview = (next: number) => {
    setDraft(next);
    const root = document.getElementById("root");
    if (root) root.style.opacity = String(next / 100);
  };

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span>不透明度</span>
        <span className="tabular-nums text-sm">{draft}%</span>
      </div>
      <input
        type="range"
        min={MIN_WINDOW_OPACITY}
        max={MAX_WINDOW_OPACITY}
        step={5}
        value={draft}
        aria-label="ウィンドウの不透明度"
        onChange={(e) => preview(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full accent-primary"
      />
    </div>
  );
}

const fetchIntervalOptions = [
  { label: "自動", value: FETCH_INTERVAL_AUTO },
  { label: "10秒", value: 10_000 },
  { label: "30秒", value: 30_000 },
  { label: "1分", value: 60_000 },
  { label: "3分", value: 180_000 },
  { label: "5分", value: 300_000 },
  { label: "10分", value: 600_000 },
  { label: "20分", value: 1_200_000 },
  { label: "30分", value: 1_800_000 },
];

const trayIconComponentOptions = [
  { label: "アプリアイコン", value: TrayIconComponent.AppIcon },
  { label: "左右ラベル", value: TrayIconComponent.RoleLabel },
  { label: "電池アイコン", value: TrayIconComponent.BatteryIcon },
  { label: "電池残量(%)", value: TrayIconComponent.BatteryPercent },
];

const Settings: React.FC<SettingsScreenProps> = ({ onExit }) => {
  const { setTheme, theme } = useTheme();
  const { config, setConfig } = useConfigContext();
  const isMac = platform() === "macos";

  const handleTrayIconComponentChange = (component: TrayIconComponent, checked: boolean) => {
    setConfig((c) => {
      const current = c.trayIconComponents;
      const next = checked ? [...current, component] : current.filter((item) => item !== component);
      return {
        ...c,
        trayIconComponents: next.length > 0 ? next : current,
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full min-h-0 flex-col p-2">
      <div
        className={cn(
          "shrink-0 flex justify-end",
          config.manualWindowPositioning && "cursor-grab active:cursor-grabbing",
        )}
        data-tauri-drag-region={config.manualWindowPositioning ? true : undefined}
      >
        <TopRightButtons
          buttons={[
            {
              icon: <XMarkIcon className="size-5 text-foreground" />,
              onClick: onExit,
              ariaLabel: "閉じる",
            },
          ]}
        />
      </div>

      {/* Scroll area */}
      <div className="app-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="ml-4 mr-2 mb-4 flex min-w-0 max-w-md flex-col gap-3 pt-1">
          {/* Auto start at login */}
          <SettingsGroup>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0">ログイン時に自動起動</span>
              <Switch
                checked={config.autoStart}
                onCheckedChange={(checked) => setConfig((c) => ({ ...c, autoStart: checked }))}
              />
            </div>
          </SettingsGroup>

          {/* Theme */}
          <SettingsGroup>
            <div className="flex justify-between items-center">
              <span>テーマ</span>
              <div className="flex-1 flex justify-end gap-2">
                {[
                  {
                    key: "light",
                    icon: (
                      <div className="flex flex-col items-center justify-center">
                        <SunIcon className="w-6 h-6" />
                        <span className="text-xs">ライト</span>
                      </div>
                    ),
                    label: "ライト",
                  },
                  {
                    key: "dark",
                    icon: (
                      <div className="flex flex-col items-center justify-center">
                        <MoonIcon className="w-6 h-6" />
                        <span className="text-xs">ダーク</span>
                      </div>
                    ),
                    label: "ダーク",
                  },
                  {
                    key: "system",
                    icon: (
                      <div className="flex flex-col items-center justify-center">
                        <span className="relative w-6 h-6 flex items-center justify-center">
                          <SunIcon className="absolute w-4 h-4 left-[-7%] top-[-7%]" />
                          <MoonIcon className="absolute w-4 h-4 right-[-7%] bottom-[-7%]" />
                          <svg
                            className="absolute left-0 top-0 w-6 h-6 pointer-events-none"
                            width="24"
                            height="24"
                          >
                            <line
                              x1="0"
                              y1="20"
                              x2="20"
                              y2="0"
                              stroke="currentColor"
                              strokeWidth="0.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </span>
                        <span className="text-xs">システム</span>
                      </div>
                    ),
                    label: "システム",
                  },
                ].map((opt) => (
                  <Button
                    key={opt.key}
                    onClick={() => {
                      setTheme(opt.key as Theme);
                      setConfig((c) => ({ ...c, theme: opt.key as Theme }));
                    }}
                    className={`relative w-12 h-12 flex items-center justify-center rounded-lg transition-colors
										${theme === opt.key ? "bg-muted-foreground/30" : "bg-transparent hover:bg-secondary"}
									`}
                    aria-label={opt.label}
                  >
                    {opt.icon}
                  </Button>
                ))}
              </div>
            </div>
          </SettingsGroup>

          {/* Window */}
          <SettingsGroup className="flex w-full flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span>ウィンドウを移動できるようにする</span>
              <Switch
                aria-label="ウィンドウを移動できるようにする"
                checked={config.manualWindowPositioning}
                onCheckedChange={(checked) =>
                  setConfig((c) => ({ ...c, manualWindowPositioning: checked }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              オンにすると、ウィンドウ上部の余白をドラッグして好きな位置へ移動できます。位置は保存されます。
            </p>
            <div className="flex items-center justify-between gap-3">
              <span>ウィンドウを常に表示(ピン留め)</span>
              <Switch
                aria-label="ウィンドウを常に表示(ピン留め)"
                checked={config.pinWindow}
                onCheckedChange={(checked) => setConfig((c) => ({ ...c, pinWindow: checked }))}
              />
            </div>
            <WindowOpacitySlider
              value={clampWindowOpacity(config.windowOpacity)}
              onCommit={(value) => setConfig((c) => ({ ...c, windowOpacity: value }))}
            />
          </SettingsGroup>

          {/* Battery refresh interval */}
          <SettingsGroup>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="shrink-0">電池残量の更新間隔</span>
              <div className="flex min-w-0 max-w-full flex-1 basis-0 justify-end">
                <Select
                  value={config.fetchInterval.toString()}
                  onValueChange={(value) =>
                    setConfig((c) => ({
                      ...c,
                      fetchInterval:
                        value === FETCH_INTERVAL_AUTO ? FETCH_INTERVAL_AUTO : Number(value),
                    }))
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className={cn(
                      "data-[size=sm]:h-auto h-auto min-h-8 w-fit min-w-0 max-w-full whitespace-normal",
                      "*:data-[slot=select-value]:block! *:data-[slot=select-value]:line-clamp-2! *:data-[slot=select-value]:whitespace-normal! *:data-[slot=select-value]:text-left",
                    )}
                  >
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {fetchIntervalOptions.map((opt) => (
                      <SelectItem key={opt.value.toString()} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SettingsGroup>

          {/* Auto collapse disconnected devices */}
          <SettingsGroup>
            <div className="flex items-center justify-between gap-3">
              <span>切断中のデバイスを自動で折りたたむ</span>
              <Switch
                checked={config.autoCollapseDisconnectedDevices}
                onCheckedChange={(checked) =>
                  setConfig((c) => ({ ...c, autoCollapseDisconnectedDevices: checked }))
                }
              />
            </div>
          </SettingsGroup>

          {/* Tray icon components (macOS only) */}
          {isMac && (
            <SettingsGroup className="flex w-full flex-col gap-2">
              <div className="flex justify-between">
                <span>トレイアイコンの表示項目 [macOSのみ]</span>
              </div>
              <ul className="w-full space-y-0.5 pl-2">
                {trayIconComponentOptions.map((option) => {
                  const checked = config.trayIconComponents.includes(option.value);
                  const isLastChecked = checked && config.trayIconComponents.length === 1;
                  return (
                    <li key={option.value} className="flex items-center justify-between gap-3">
                      <div>
                        <Dot /> {option.label}
                      </div>
                      <Switch
                        checked={checked}
                        onCheckedChange={(nextChecked) =>
                          handleTrayIconComponentChange(option.value, nextChecked)
                        }
                        disabled={isLastChecked}
                      />
                    </li>
                  );
                })}
              </ul>
            </SettingsGroup>
          )}

          {/* Push notifications */}
          <SettingsGroup className="flex w-full flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0">プッシュ通知</span>
              <Switch
                checked={config.pushNotification}
                onCheckedChange={(checked) =>
                  setConfig((c) => ({ ...c, pushNotification: checked }))
                }
              />
            </div>
            <ul
              className={`w-full space-y-0.5 pl-2 ${!config.pushNotification ? " text-muted-foreground" : "text-card-foreground"}`}
            >
              <li className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <Dot /> 電池残量が
                  <BatteryThresholdInput
                    value={config.lowBatteryThreshold}
                    disabled={
                      !config.pushNotification ||
                      !config.pushNotificationWhen[NotificationType.LowBattery]
                    }
                    disabledTitle={
                      !config.pushNotification
                        ? "編集するにはプッシュ通知をオンにしてください"
                        : "編集するには右のスイッチをオンにしてください"
                    }
                    fallback={defaultConfig.lowBatteryThreshold}
                    max={config.highBatteryThreshold - 1}
                    onCommit={(value) => setConfig((c) => ({ ...c, lowBatteryThreshold: value }))}
                    ariaLabel="低残量のしきい値"
                  />
                  %以下
                </div>
                <Switch
                  checked={config.pushNotificationWhen[NotificationType.LowBattery]}
                  onCheckedChange={(checked) =>
                    setConfig((c) => ({
                      ...c,
                      pushNotificationWhen: {
                        ...c.pushNotificationWhen,
                        [NotificationType.LowBattery]: checked,
                      },
                    }))
                  }
                  disabled={!config.pushNotification}
                />
              </li>
              <li className="ml-4 flex items-center justify-between gap-3">
                <div>
                  <Dot /> 0%は無視する
                </div>
                <Switch
                  checked={config.ignoreZeroPercent}
                  onCheckedChange={(checked) =>
                    setConfig((c) => ({ ...c, ignoreZeroPercent: checked }))
                  }
                  disabled={
                    !config.pushNotification ||
                    !config.pushNotificationWhen[NotificationType.LowBattery]
                  }
                />
              </li>
              <li className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <Dot /> 電池残量が
                  <BatteryThresholdInput
                    value={config.highBatteryThreshold}
                    disabled={
                      !config.pushNotification ||
                      !config.pushNotificationWhen[NotificationType.HighBattery]
                    }
                    disabledTitle={
                      !config.pushNotification
                        ? "編集するにはプッシュ通知をオンにしてください"
                        : "編集するには右のスイッチをオンにしてください"
                    }
                    fallback={defaultConfig.highBatteryThreshold}
                    min={config.lowBatteryThreshold + 1}
                    onCommit={(value) => setConfig((c) => ({ ...c, highBatteryThreshold: value }))}
                    ariaLabel="高残量のしきい値"
                  />
                  %以上
                </div>
                <Switch
                  checked={config.pushNotificationWhen[NotificationType.HighBattery]}
                  onCheckedChange={(checked) =>
                    setConfig((c) => ({
                      ...c,
                      pushNotificationWhen: {
                        ...c.pushNotificationWhen,
                        [NotificationType.HighBattery]: checked,
                      },
                    }))
                  }
                  disabled={!config.pushNotification}
                />
              </li>
              <li className="flex items-center justify-between gap-3">
                <div>
                  <Dot /> デバイス接続時
                </div>
                <Switch
                  checked={config.pushNotificationWhen[NotificationType.Connected]}
                  onCheckedChange={(checked) =>
                    setConfig((c) => ({
                      ...c,
                      pushNotificationWhen: {
                        ...c.pushNotificationWhen,
                        [NotificationType.Connected]: checked,
                      },
                    }))
                  }
                  disabled={!config.pushNotification}
                />
              </li>
              <li className="flex items-center justify-between gap-3">
                <div>
                  <Dot /> デバイス切断時
                </div>
                <Switch
                  checked={config.pushNotificationWhen[NotificationType.Disconnected]}
                  onCheckedChange={(checked) =>
                    setConfig((c) => ({
                      ...c,
                      pushNotificationWhen: {
                        ...c.pushNotificationWhen,
                        [NotificationType.Disconnected]: checked,
                      },
                    }))
                  }
                  disabled={!config.pushNotification}
                />
              </li>
            </ul>
          </SettingsGroup>

          <SettingsGroup>
            <div className="flex items-center justify-between gap-3">
              <span>zmk-battery-center の更新を確認</span>
              <Switch
                aria-label="zmk-battery-center の更新を確認"
                checked={config.updateCheckEnabled}
                onCheckedChange={(checked) =>
                  setConfig((current) => ({ ...current, updateCheckEnabled: checked }))
                }
              />
            </div>
          </SettingsGroup>

          {/* External battery snapshot */}
          <SettingsGroup>
            <div className="flex items-center justify-between gap-3">
              <span>外部連携用の電池情報を出力</span>
              <Switch
                checked={config.externalBatterySnapshot}
                onCheckedChange={(checked) =>
                  setConfig((c) => ({ ...c, externalBatterySnapshot: checked }))
                }
              />
            </div>
          </SettingsGroup>
          <LoggingSettings />
        </div>
      </div>
    </div>
  );
};

export default Settings;
