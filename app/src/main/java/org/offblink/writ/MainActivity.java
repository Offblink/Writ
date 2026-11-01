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
    /** 原生缓存的安全区（insets 派发可能早于页面 JS 就绪，onPageFinished 后补注一次） */
    private int safeTop;
    private int safeBottom;

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
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectInsets(); // 立即补注缓存值
                // 兜底"监听器从未触发"：强制重新派发一次 insets
                view.post(() -> androidx.core.view.ViewCompat.requestApplyInsets(view));
            }
        });
        web.addJavascriptInterface(new WritHost(this, web), "Writ");

        // 安全区：老 WebView 的 env(safe-area-inset-*) 为 0（真机实测顶栏钻进状态栏），
        // 由原生读系统栏/刘海 insets 注入 --safe-top/--safe-bottom（head 内联脚本已预置 __setInsets）
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            int sys = androidx.core.view.WindowInsetsCompat.Type.systemBars()
                    | androidx.core.view.WindowInsetsCompat.Type.displayCutout();
            safeTop = insets.getInsets(sys).top;
            safeBottom = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).bottom;
            injectInsets();
            return insets;
        });

        web.loadUrl("file:///android_asset/web/index.html");
    }

    private void injectInsets() {
        web.evaluateJavascript("window.__setInsets&&window.__setInsets(" + safeTop + "," + safeBottom + ")", null);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
