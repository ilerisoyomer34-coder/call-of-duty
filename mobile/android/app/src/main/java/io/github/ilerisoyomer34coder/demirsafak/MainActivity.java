package io.github.ilerisoyomer34coder.demirsafak;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

// Demir Şafak: yatay (AndroidManifest → sensorLandscape), tam ekran oyun. Durum ve gezinme çubukları gizlenir,
// kenardan kaydırınca kısa süre görünür; oynarken ekran kararmaz. Geri tuşu oyunun içinde ele alınır
// (web/src/native.js: tarayıcı geçmişi bekçisi), burada ek kod gerekmez.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Klavye ya da bildirim panelinden dönünce çubuklar yeniden gizlensin
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
