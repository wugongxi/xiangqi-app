// 应用内版本更新检测 (App Harbor: app.ffxx.top)
// 用法: startUpdateWatcher(info => { ... }) — 启动 3 秒后检查一次, 之后每 3 小时一次
// ⚠️ 每次发版必须同步修改 APP_VERSION / APP_BUILD 和 android/app/build.gradle 的 versionName/versionCode

export const UPDATE_SERVER = 'https://app.ffxx.top'
export const APP_VERSION = '1.0.2'
export const APP_BUILD = 3

const CHECK_INTERVAL = 3 * 60 * 60 * 1000 // 3 小时
const FIRST_DELAY = 3000                  // 启动后首次检查延迟

export async function checkForUpdate() {
  try {
    const q = new URLSearchParams({
      app: 'xiangqi',
      platform: 'android',
      packageName: 'top.ffxx.xiangqi',
      channel: 'stable',
      build: String(APP_BUILD),
      arch: 'universal',
    })
    const res = await fetch(`${UPDATE_SERVER}/api/v1/updates/check?${q}`)
    if (!res.ok) return null
    const d = await res.json()
    if (!d.updateAvailable) return null
    const a = (d.artifacts || [])[0]
    return {
      version: d.version,
      build: d.build,
      notes: d.notes || '',
      forceUpdate: !!d.forceUpdate,
      url: a ? UPDATE_SERVER + a.url : '',
      size: a ? a.size : 0,
    }
  } catch (e) {
    return null // 离线/网络异常: 静默跳过, 不影响游戏
  }
}

// 返回停止函数 (组件卸载时调用)
export function startUpdateWatcher(onUpdate) {
  let stopped = false
  let checking = false
  const tick = async () => {
    if (stopped || checking) return
    checking = true
    const info = await checkForUpdate()
    checking = false
    if (!stopped && info) onUpdate(info)
  }
  const timer = setTimeout(tick, FIRST_DELAY)
  const interval = setInterval(tick, CHECK_INTERVAL)
  return () => {
    stopped = true
    clearTimeout(timer)
    clearInterval(interval)
  }
}
