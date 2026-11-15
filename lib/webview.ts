import { WebView as BaseWebView } from 'react-native-webview';

// react-native-webview 14.0.1 타입 정의는 기본 제네릭(undefined) 때문에 props 가 never 가 됨
export const WebView = BaseWebView<object>;
export type WebView = BaseWebView<object>;
