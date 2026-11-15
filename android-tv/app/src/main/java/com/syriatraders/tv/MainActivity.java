package com.syriatraders.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.TextView;

/**
 * The game's TV table screen, full screen, without a browser around it.
 *
 * The PC still runs the game (rules, dice, hands, saves). This app only opens the
 * PC's TV address (http://PC:8080/tv) in a hardware-accelerated WebView, keeps the
 * screen awake, plays the table sounds without a key press, and never quits on a
 * stray Back press mid-match.
 */
public class MainActivity extends Activity {
    static final String PREFS = "syria_traders_tv";
    static final String KEY_ADDRESS = "address";
    static final String DEFAULT_ADDRESS = "192.168.1.164:8080";
    static final long RETRY_MS = 5000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private WebView web;
    private View setup;
    private View offline;
    private EditText address;
    private TextView offlineBody;
    private String url;
    private boolean failed;

    private final Runnable retry = new Runnable() {
        @Override
        public void run() {
            if (url != null && offline.getVisibility() == View.VISIBLE) load();
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        web = findViewById(R.id.web);
        setup = findViewById(R.id.setup);
        offline = findViewById(R.id.offline);
        address = findViewById(R.id.address);
        offlineBody = findViewById(R.id.offline_body);

        configureWebView();

        findViewById(R.id.connect).setOnClickListener(v -> connect());
        address.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                connect();
                return true;
            }
            return false;
        });
        findViewById(R.id.retry).setOnClickListener(v -> load());
        findViewById(R.id.change).setOnClickListener(v -> showSetup());

        String saved = prefs.getString(KEY_ADDRESS, null);
        if (saved == null) {
            showSetup();
        } else {
            url = saved;
            load();
        }
    }

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Table sounds start without first pressing a key on the remote.
        s.setMediaPlaybackRequiresUserGesture(false);
        // Honour the page's width=1920 viewport and scale it to fill the TV.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // A TV's accessibility font size would otherwise break the table layout.
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " SyriaTradersTV/1.0");

        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setBackgroundColor(getResources().getColor(R.color.bg));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                failed = false;
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                if (!failed) showGame();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    failed = true;
                    showOffline();
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                // Android 5: the only error callback there is.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M && failingUrl != null && failingUrl.equals(url)) {
                    failed = true;
                    showOffline();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String target) {
                return false; // every link stays inside the app
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The TV ran out of memory and killed the page: start it again rather than crash.
                recreate();
                return true;
            }
        });
    }

    private void connect() {
        String next = Address.normalize(address.getText().toString());
        if (next == null) {
            address.setError(getString(R.string.setup_hint));
            return;
        }
        url = next;
        prefs.edit().putString(KEY_ADDRESS, url).apply();
        load();
    }

    private void load() {
        handler.removeCallbacks(retry);
        failed = false;
        setup.setVisibility(View.GONE);
        web.loadUrl(url);
    }

    private void showGame() {
        handler.removeCallbacks(retry);
        setup.setVisibility(View.GONE);
        offline.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.requestFocus();
        hideSystemBars();
    }

    private void showOffline() {
        web.setVisibility(View.INVISIBLE);
        setup.setVisibility(View.GONE);
        offlineBody.setText(getString(R.string.offline_body, url));
        boolean wasShowing = offline.getVisibility() == View.VISIBLE;
        offline.setVisibility(View.VISIBLE);
        if (!wasShowing) findViewById(R.id.retry).requestFocus();
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    private void showSetup() {
        handler.removeCallbacks(retry);
        web.stopLoading();
        web.setVisibility(View.INVISIBLE);
        offline.setVisibility(View.GONE);
        setup.setVisibility(View.VISIBLE);
        String current = url == null ? DEFAULT_ADDRESS : Address.display(url);
        address.setText(current);
        address.setSelection(current.length());
        address.requestFocus();
    }

    private void showMenu() {
        CharSequence[] items = {
                getString(R.string.menu_back),
                getString(R.string.menu_reload),
                getString(R.string.change_address),
                getString(R.string.menu_exit),
        };
        new AlertDialog.Builder(this)
                .setTitle(R.string.menu_title)
                .setItems(items, (dialog, which) -> {
                    if (which == 1) load();
                    else if (which == 2) showSetup();
                    else if (which == 3) finish();
                })
                .show();
    }

    @Override
    public void onBackPressed() {
        // Never quit mid-match on one Back press: offer a small menu instead.
        if (setup.getVisibility() == View.VISIBLE && url != null) {
            load();
        } else if (setup.getVisibility() == View.VISIBLE) {
            finish();
        } else {
            showMenu();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showMenu();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
