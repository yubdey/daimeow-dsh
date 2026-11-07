window.__ModuleLoader__.load({
  id: 'daimeow-dsh',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState } = React;

    const COPY = {
      zh: {
        'pet.show': '显示呆喵',
        'pet.showError': '呆喵暂时没有响应',
      },
      en: {
        'pet.show': 'Show DaiMeow',
        'pet.showError': 'DaiMeow did not respond',
      },
    };

    function createLauncher(ctx) {
      const t = ctx.locale.bind('daimeow-dsh');

      function disableOutcome(answer) {
        if (!answer || answer.ok === false) {
          return {
            ok: false,
            state: `dsh-client-error: ${answer?.error?.message || answer?.error || 'remote call failed'}`,
          };
        }
        const result = answer.value ?? answer;
        if (result?.error) {
          return {
            ok: false,
            state: `error: ${result.error.code || 'plugin-manager-error'}`,
            result,
          };
        }
        if (result?.application === 'applied') return { ok: true, state: 'disabled', result };
        return {
          ok: false,
          state: result?.application === 'restart-required'
            ? 'restart-required'
            : `not-applied: ${result?.application || 'unknown'}`,
          result,
        };
      }

      return function DesktopLauncher() {
        const [open, setOpen] = useState(true);
        const [visible, setVisible] = useState(true);
        const [showing, setShowing] = useState(false);
        const [error, setError] = useState('');

        useEffect(() => {
          let stopped = false;
          let activeRequest = '';
          let dispatching = false;
          const report = async (payload) => {
            try {
              await fetch('/daimeow/detached/disable-result', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
                keepalive: true,
              });
            } catch {
              // Host 可能已随着插件卸载而关闭；成功卸载时不需要额外回报。
            }
          };
          const requestDisable = async (request) => {
            if (dispatching || typeof request?.requestId !== 'string') return;
            dispatching = true;
            activeRequest = request.requestId;
            await report({
              requestId: request.requestId,
              status: 'dispatching',
            });
            let answer;
            try {
              answer = await ctx.remote.pluginManager.setBundleEnabled('daimeow-dsh', false);
            } catch (error) {
              answer = {
                ok: false,
                error: { message: error instanceof Error ? error.message : String(error) },
              };
            }
            dispatching = false;
            if (stopped) return;
            const outcome = disableOutcome(answer);
            await report({
              requestId: request.requestId,
              ok: outcome.ok,
              state: outcome.state,
              result: outcome.result ?? null,
            });
          };
          const tick = async () => {
            try {
              const response = await fetch('/daimeow/detached/status', {
                cache: 'no-store',
              });
              const data = await response.json();
              if (stopped) return;
              setOpen(data.open === true);
              setVisible(data.visible === true);
              if (data.disableRequest?.requestId !== activeRequest) {
                void requestDisable(data.disableRequest);
              }
            } catch {
              // Host 正在重载时保留上一帧状态，避免按钮闪烁。
            }
          };
          tick();
          const timer = window.setInterval(tick, 1500);
          const refreshNow = () => {
            if (!stopped && !document.hidden) void tick();
          };
          window.addEventListener('focus', refreshNow);
          document.addEventListener('visibilitychange', refreshNow);
          return () => {
            stopped = true;
            window.clearInterval(timer);
            window.removeEventListener('focus', refreshNow);
            document.removeEventListener('visibilitychange', refreshNow);
          };
        }, []);

        if (!open || visible) return null;

        const show = async () => {
          if (showing) return;
          setShowing(true);
          setError('');
          try {
            const response = await fetch('/daimeow/detached/show', {
              method: 'POST',
              cache: 'no-store',
            });
            if (!response.ok) {
              setError(t('pet.showError'));
            }
            // 不提前隐藏入口；由状态轮询确认 helper 已真正显示。
          } catch {
            setError(t('pet.showError'));
          } finally {
            setShowing(false);
          }
        };

        return h('button', {
          type: 'button',
          title: error || t('pet.show'),
          'aria-label': t('pet.show'),
          disabled: showing,
          onClick: show,
          style: {
            position: 'fixed',
            right: 14,
            bottom: 18,
            zIndex: 2147483000,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            border: '1px solid rgba(127, 127, 127, 0.3)',
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.92)',
            color: '#475569',
            font: '500 12px/1 "Microsoft YaHei", "Segoe UI", sans-serif',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            cursor: showing ? 'wait' : 'pointer',
            opacity: showing ? 0.72 : 1,
            backdropFilter: 'blur(10px)',
          },
        }, showing ? '🐾 …' : `🐾 ${t('pet.show')}`);
      };
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.pluginManager'],
      async apply(ctx) {
        ctx.effect(
          () => ctx.locale.register('daimeow-dsh', COPY),
          'daimeow-dsh: locale dictionary',
        );
        const DesktopLauncher = createLauncher(ctx);
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'daimeow-dsh',
          order: 40,
        }, DesktopLauncher));
      },
    };
  },
});
