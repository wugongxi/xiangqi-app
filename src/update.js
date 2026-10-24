// 应用内版本更新检测 (App Harbor: app.ffxx.top)
// 用法: startUpdateWatcher(info => { ... }) — 打开后立即检查一次, 之后每 3 小时一次
// ⚠️ 每次发版必须同步修改 APP_VERSION / APP_BUILD 和 android/app/build.gradle 的 versionName/versionCode

import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'

// 原生插件: 应用内下载 APK 并触发系统安装 (仅原生环境可用)
export const AppInstaller = registerPlugin('AppInstaller')

export const UPDATE_SERVER = 'https://app.ffxx.top'
export const APP_VERSION = '1.0.13'
export const APP_BUILD = 14

const CHECK_INTERVAL = 3 * 60 * 60 * 1000 // 3 小时
const FIRST_DELAY = 0                     // 打开后立即首次检查

const PARAMS = {
  app: 'xiangqi',
  platform: 'android',
  packageName: 'top.ffxx.xiangqi',
  channel: 'stable',
  arch: 'universal',
}

export async function checkForUpdate() {
  try {
    const url = `${UPDATE_SERVER}/api/v1/updates/check`
    let d
    if (Capacitor.isNativePlatform()) {
      // 原生环境走 Capacitor 原生 HTTP, 不受 WebView CORS 限制
      // (该接口无 Access-Control-Allow-Origin 头, WebView 内 fetch 会被 CORS 拦截)
      const res = await CapacitorHttp.get({
        url,
        params: { ...PARAMS, build: String(APP_BUILD) },
        readTimeout: 10000,
        connectTimeout: 10000,
      })
      d = res.data
      if (typeof d === 'string') d = JSON.parse(d)
    } else {
      // 浏览器环境 (跨域时可能因无 CORS 头而失败)
      const res = await fetch(`${url}?${new URLSearchParams({ ...PARAMS, build: String(APP_BUILD) })}`)
      if (!res.ok) return null
      d = await res.json()
    }
    if (!d || !d.updateAvailable) return null
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
