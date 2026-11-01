package org.offblink.writ;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * WebView 桥：web 层把合成好的透明 PNG 以 base64 交来，这里负责三件出口。
 * JavascriptInterface 方法跑在非 UI 线程；操作结果统一回吐给 web 层 toast 展示
 * （拒绝原生 Toast——UI 一律由 web 层自绘）。唯一例外：分享面板本身是
 * Android 应用交接台，分享到微信/QQ 必经，无 web 替代。
 */
public class WritHost {

    private final Activity act;
    private final WebView web;

    WritHost(Activity act, WebView web) {
        this.act = act;
        this.web = web;
    }

    /** 结果回吐 web 层：调用页面里的 WritToast(msg)（app.js 已挂全局） */
    private void report(final String msg) {
        final String safe = msg.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
        act.runOnUiThread(() -> web.evaluateJavascript(
                "window.WritToast && window.WritToast('" + safe + "')", null));
    }

    /** dataURL → Bitmap；失败返回 null */
    private static Bitmap decodeDataUrl(String dataUrl) {
        int comma = dataUrl.indexOf(',');
        if (comma < 0) {
            return null;
        }
        byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
    }

    /** 存相册：29+ 走 MediaStore（无需权限），26~28 写公共 Pictures/Writ */
    @JavascriptInterface
    public void savePng(String dataUrl) {
        Bitmap bmp = decodeDataUrl(dataUrl);
        if (bmp == null) {
            report("图片解码失败");
            return;
        }
        String name = "Writ_" + System.currentTimeMillis() + ".png";
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Writ");
                cv.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = act.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) {
                    report("存相册失败");
                    return;
                }
                try (OutputStream os = act.getContentResolver().openOutputStream(uri)) {
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
                }
                cv.clear();
                cv.put(MediaStore.Images.Media.IS_PENDING, 0);
                act.getContentResolver().update(uri, cv, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_PICTURES), "Writ");
                if (!dir.exists() && !dir.mkdirs()) {
                    report("无法创建相册目录");
                    return;
                }
                File out = new File(dir, name);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, fos);
                }
                MediaStore.Images.Media.insertImage(act.getContentResolver(), out.getAbsolutePath(), name, null);
            }
            report("已存入相册 · Pictures/Writ");
        } catch (Exception e) {
            report("存相册失败：" + e.getMessage());
        }
    }

    /** 落 cacheDir/share/ → FileProvider → 系统分享面板 */
    @JavascriptInterface
    public void sharePng(String dataUrl) {
        Bitmap bmp = decodeDataUrl(dataUrl);
        if (bmp == null) {
            report("图片解码失败");
            return;
        }
        try {
            Uri uri = writeCacheUri(bmp, "Writ_" + System.currentTimeMillis() + ".png");
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/png");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            act.runOnUiThread(() -> {
                try {
                    act.startActivity(Intent.createChooser(intent, "分享 Writ 图片"));
                } catch (Exception e) {
                    report("没有可分享的应用");
                }
            });
        } catch (Exception e) {
            report("分享失败：" + e.getMessage());
        }
    }

    /** 图片进剪贴板（content URI 型 clip，微信等长按粘贴可取） */
    @JavascriptInterface
    public void copyPng(String dataUrl) {
        Bitmap bmp = decodeDataUrl(dataUrl);
        if (bmp == null) {
            report("图片解码失败");
            return;
        }
        try {
            Uri uri = writeCacheUri(bmp, "Writ_" + System.currentTimeMillis() + ".png");
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = ClipData.newUri(act.getContentResolver(), "Writ 图片", uri);
            cm.setPrimaryClip(clip);
            report("图片已复制，去聊天框长按粘贴");
        } catch (Exception e) {
            report("复制失败：" + e.getMessage());
        }
    }

    private Uri writeCacheUri(Bitmap bmp, String name) throws Exception {
        File dir = new File(act.getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("cache/share 不可写");
        }
        File out = new File(dir, name);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, fos);
        }
        return FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", out);
    }
}
