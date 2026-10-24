package top.ffxx.xiangqi;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用内更新安装插件:
 * 在原生层直接下载 APK 到应用缓存目录(带进度回调),
 * 下载完成后通过 FileProvider 拉起系统安装器, 不再跳转浏览器。
 * 若用户尚未授予"安装未知应用"权限, 先引导到授权页, 返回后自动继续安装。
 */
@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

  private static final String TAG = "AppInstaller";
  /** 尚未授权"安装未知应用"时暂存已下载的 APK, 授权返回后自动继续安装 */
  private File pendingApk = null;

  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    final String url = call.getString("url");
    if (url == null || url.isEmpty()) {
      call.reject("url is required");
      return;
    }
    // 下载在后台线程进行, 完成后再 resolve/reject
    new Thread(() -> {
      try {
        File apk = download(url);
        Log.i(TAG, "APK downloaded: " + apk.getAbsolutePath() + " size=" + apk.length());
        triggerInstall(apk);
        call.resolve();
      } catch (Exception e) {
        Log.e(TAG, "download/install failed", e);
        // e.toString() 携带异常类名, 便于 JS 侧 toast 直接定位问题
        call.reject("download/install failed: " + e);
      }
    }).start();
  }

  /**
   * 返回当前窗口安全区 (px), 供网页加载后主动获取一次,
   * 与 MainActivity 的 CSS 变量注入双保险。
   * top 取 max(刘海inset, 状态栏高度) 的恒定值, 与系统栏显隐解耦,
   * 避免 select 弹窗等场景注入瞬态大值后卡住。
   */
  @PluginMethod
  public void safeInsets(PluginCall call) {
    Insets cut = ViewCompat.getRootWindowInsets(getBridge().getWebView())
        .getInsets(WindowInsetsCompat.Type.displayCutout());
    JSObject ret = new JSObject();
    ret.put("top", Math.max(cut.top, MainActivity.getStatusBarHeight(getContext())));
    ret.put("bottom", cut.bottom);
    ret.put("left", cut.left);
    ret.put("right", cut.right);
    call.resolve(ret);
  }

  private File download(String urlStr) throws Exception {
    File apk = new File(getContext().getCacheDir(), "update.apk");
    Exception last = null;
    // 网络抖动自动重试一次
    for (int attempt = 1; attempt <= 2; attempt++) {
      try {
        return downloadOnce(urlStr, apk);
      } catch (IOException e) {
        last = e;
        Log.w(TAG, "download attempt " + attempt + " failed: " + e);
      }
    }
    throw last;
  }

  private File downloadOnce(String urlStr, File apk) throws Exception {
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) new URL(urlStr).openConnection();
      conn.setConnectTimeout(15000);
      conn.setReadTimeout(30000);
      conn.setInstanceFollowRedirects(true);
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
      long total = conn.getContentLength();
      InputStream in = conn.getInputStream();
      FileOutputStream out = new FileOutputStream(apk);
      byte[] buf = new byte[16384];
      long done = 0;
      int n;
      while ((n = in.read(buf)) > 0) {
        out.write(buf, 0, n);
        done += n;
        if (total > 0) {
          JSObject p = new JSObject();
          p.put("progress", (int) (done * 100 / total));
          notifyListeners("progress", p);
        }
      }
      out.flush();
      out.close();
      in.close();
      if (total > 0 && done != total) throw new IOException("incomplete: " + done + "/" + total);
    } finally {
      if (conn != null) conn.disconnect();
    }
    return apk;
  }

  private void triggerInstall(File apk) throws Exception {
    PackageManager pm = getContext().getPackageManager();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !pm.canRequestPackageInstalls()) {
      // 未授予"安装未知应用"权限: 引导到授权页, 返回后 onResume 自动继续
      Log.i(TAG, "unknown-sources permission missing, open settings; apk=" + apk.getName());
      pendingApk = apk;
      Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + getContext().getPackageName()));
      settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      if (getActivity() != null) getActivity().startActivity(settings);
      else getContext().startActivity(settings);
      return;
    }
    startInstall(apk);
  }

  private void startInstall(File apk) throws Exception {
    Uri uri = FileProvider.getUriForFile(
        getContext(), getContext().getPackageName() + ".fileprovider", apk);
    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(uri, "application/vnd.android.package-archive");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    if (getActivity() != null) {
      getActivity().startActivity(intent);
    } else {
      getContext().startActivity(intent);
    }
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    // 用户在授权页打开"允许安装"返回后, 自动继续安装暂存的 APK
    if (pendingApk != null && pendingApk.exists()) {
      File apk = pendingApk;
      pendingApk = null;
      try {
        Log.i(TAG, "resuming install after permission grant");
        startInstall(apk);
      } catch (Exception e) {
        Log.e(TAG, "resume install failed", e);
      }
    }
  }
}
