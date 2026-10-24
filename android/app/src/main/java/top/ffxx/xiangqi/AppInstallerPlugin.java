package top.ffxx.xiangqi;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用内更新安装插件:
 * 在原生层直接下载 APK 到应用缓存目录(带进度回调),
 * 下载完成后通过 FileProvider 拉起系统安装器, 不再跳转浏览器。
 */
@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

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
        triggerInstall(apk);
        call.resolve();
      } catch (Exception e) {
        call.reject("download/install failed: " + e.getMessage());
      }
    }).start();
  }

  private File download(String urlStr) throws Exception {
    File apk = new File(getContext().getCacheDir(), "update.apk");
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) new URL(urlStr).openConnection();
      conn.setConnectTimeout(15000);
      conn.setReadTimeout(30000);
      conn.setInstanceFollowRedirects(true);
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
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
    } finally {
      if (conn != null) conn.disconnect();
    }
    return apk;
  }

  private void triggerInstall(File apk) throws Exception {
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
}
