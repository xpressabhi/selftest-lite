package com.selftest.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            // Google Sign-In (GIS) can open an OAuth popup; the Capacitor
            // WebView blocks JS popups by default. Enabling them here makes
            // popup-mode sign-in work, and is a fallback for redirect mode
            // (the primary path for the WebView shell).
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setSupportMultipleWindows(true);
        } catch (Exception ignored) {
            // Sign-in falls back to GIS redirect mode if popups can't be enabled.
        }
    }
}
