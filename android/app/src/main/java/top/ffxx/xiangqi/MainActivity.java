package top.ffxx.xiangqi;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // ⚠️ 必须在 super.onCreate() 之前注册: Bridge 在 super.onCreate 中初始化并装载
    // 插件列表, 之后注册的插件 JS 侧会报 "not implemented" (曾导致更新退回浏览器下载)
    registerPlugin(AppInstallerPlugin.class);
    super.onCreate(savedInstanceState);
    applyThemeColors();
    setupSafeArea();
    hideSystemBars();
  }

  @Override
  public void onResume() {
    super.onResume();
    hideSystemBars();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();
  }

  /**
   * 主题色统一: 沉浸式全屏下安全区 padding 露出的是窗口背景,
   * 颜色必须与网页背景渐变 (160deg, #faf6ee → #f0e6d2) 对齐,
   * 否则状态栏/导航栏浮现时会与页面内容形成明显色差。
   */
  private void applyThemeColors() {
    int topColor = 0xFFFAF6EE;    // 页面渐变顶部色 → 状态栏
    int bottomColor = 0xFFF0E6D2; // 页面渐变底部色 → 导航栏
    getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(topColor));
    getWindow().setStatusBarColor(topColor);
    getWindow().setNavigationBarColor(bottomColor);
  }

  /**
   * 安全区适配 (edge-to-edge):
   * WebView 铺满全屏(内容延伸进刘海/系统栏区域), 保证网页内 fixed 定位的
   * 弹窗/toast 能覆盖整屏; 安全区数值通过 CSS 变量 --safe-top/bottom/left/right
   * 注入网页, 由页面自行做内容避让。
   *
   * 注意: 顶部避让量必须是恒定值 — 取 max(刘海inset, 系统状态栏高度),
   * 不能跟随 systemBars insets 变化。否则 select 弹窗等场景系统栏短暂
   * 现身时注入大值, 而瞬态系统栏(TRANSIENT)隐藏时不会再派发 insets,
   * 大值会永久卡住, 造成"切换难度后顶部距离突然变大"。
   */
  private void setupSafeArea() {
    // 允许内容延伸到刘海两侧(短边全屏)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams lp = getWindow().getAttributes();
      lp.layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(lp);
    }
    ViewGroup content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
      Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
      injectSafeArea(Math.max(cut.top, getStatusBarHeight(this)), cut.bottom, cut.left, cut.right);
      return WindowInsetsCompat.CONSUMED;
    });
    ViewCompat.requestApplyInsets(content);
  }

  /** 系统状态栏高度(资源值), 与系统栏显隐无关的常量 */
  public static int getStatusBarHeight(android.content.Context ctx) {
    int resId = ctx.getResources().getIdentifier("status_bar_height", "dimen", "android");
    return resId > 0 ? ctx.getResources().getDimensionPixelSize(resId) : 0;
  }

  /** 把安全区数值写入网页 CSS 变量 (top 为恒定避让量, 不随系统栏显隐变化) */
  private void injectSafeArea(int top, int bottom, int left, int right) {
    if (bridge == null || bridge.getWebView() == null) return;
    final String js = String.format(
        "document.documentElement.style.setProperty('--safe-top','%dpx');"
            + "document.documentElement.style.setProperty('--safe-bottom','%dpx');"
            + "document.documentElement.style.setProperty('--safe-left','%dpx');"
            + "document.documentElement.style.setProperty('--safe-right','%dpx');",
        top, bottom, left, right);
    bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
  }

  /**
   * 沉浸式全屏: 隐藏状态栏与导航栏, 内容延伸到系统栏区域;
   * 用户从屏幕边缘下滑时系统栏临时浮现, 松手后自动隐藏。
   */
  private void hideSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setSystemBarsBehavior(
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.systemBars());
  }
}
