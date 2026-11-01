package org.offblink.writ;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/**
 * Writ 主页（唯一页面）：原生只做壳与三件导出（存相册/分享/剪贴板），
 * 写字画布、裁边排版、透明 PNG 合成全在 assets/web 的 WebView 里。
 * 边到边交给 web 层的 env(safe-area-inset-*) 内边距处理。
 */
public class MainActivity extends AppCompatActivity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 边到边：内容延伸到系统栏之下，安全区由 web CSS 兜
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);

        web = findViewById(R.id.web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true);
        // 排错入口：chrome://inspect 可挂 + 页面 console 落 logcat（桥断/JS 异常不盲猜）
        WebView.setWebContentsDebuggingEnabled(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                Log.d("writ-web", m.message() + " [" + m.sourceId() + ":" + m.lineNumber() + "]");
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new WritHost(this), "Writ");

        web.loadUrl("file:///android_asset/web/index.html");
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
