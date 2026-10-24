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
    super.onCreate(savedInstanceState);
    registerPlugin(AppInstallerPlugin.class);
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
   * 安全区适配: 沉浸式全屏下内容会延伸进刘海/状态栏区域,
   * 监听系统 insets, 把顶部(刘海+状态栏)与左右安全边距注入 WebView 容器,
   * 保证菜单与按钮不被摄像头打孔/刘海遮挡。滑动呼出系统栏时边距随之变化。
   */
  private void setupSafeArea() {
    // 允许内容延伸到刘海两侧(短边全屏), 再用 insets 补偿
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams lp = getWindow().getAttributes();
      lp.layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(lp);
    }
    ViewGroup content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
      Insets safe = insets.getInsets(
          WindowInsetsCompat.Type.displayCutout()
              | WindowInsetsCompat.Type.systemBars());
      v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
      return WindowInsetsCompat.CONSUMED;
    });
    // 首次布局前也应用一次当前 insets, 避免首帧闪烁
    ViewCompat.requestApplyInsets(content);
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
