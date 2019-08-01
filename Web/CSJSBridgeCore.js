
(function(window){
    if(window.jsBridge){
        return;
    }
    var CSJSBridgeCore = function () {
        this.ua = navigator.userAgent;
        this.isAndroid = (/(Android);?[\s\/]+([\d.]+)?/.test(this.ua));
        this.isIOS = !!this.ua.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/);
        this.msgCallbackMap = {};
        this.nativeCallMap = {};
        this.JSAPIVersion = 10;
        this.nativeJSAPIVersion = 0;
    }; 

    CSJSBridgeCore.prototype.webCallNative = function(data,callback){
    var msgBody = {};
    msgBody.handler = data.handler;
    msgBody.action = data.action;
    msgBody.data = data.data;
    if(callback){
        msgBody.callbackID = _getCallbackID();
    }
    msgBody.callbackFunction = "jsBridge.callbackWeb";
    msgBody.nativeCallWebFunction = "jsBridge.nativeCallWeb";
    if (callback && typeof(callback) =='function') {
        this.msgCallbackMap[msgBody.callbackID] = callback;
    }else {
        console.log('error!callback is not function');
    }
   
    //log,APIConfig action,以及用来传递function的webCallNativeHandler不受限制使用
    if (msgBody.handler == 'core') {
        _callNative(msgBody);
    }else{
        if (this.JSAPIVersion > this.nativeJSAPIVersion) {
            this.nativelog(`error,nativeJSAPIVersion:${this.nativeJSAPIVersion} is lower than latest JSAPIVersion:${this.JSAPIVersion},action:${msgBody.action}`);
            return;
        }else{
            _callNative(msgBody);
        }
    }
  }
   
  CSJSBridgeCore.prototype.callbackWeb = function(data){
        var message = JSON.parse(data);
        var callbackID = message['callbackID'];
        var callback = this.msgCallbackMap[callbackID];
        if(callback){
            callback(message);
        }
   };
   function _callNative(msgBody){
        if (jsBridge.isIOS) {
            _callIOSNative(msgBody);
        }
        else{
            _callAndroidNative(msgBody);
        }
   };
   function _callIOSNative(msg){
        var isWkWebView =  window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.CSJSWebViewBridgeCore ? true : false;
        if(!isWkWebView){
            CSJSWebViewBridgeCore.callApp(msg);
        }else {
           window.webkit.messageHandlers.CSJSWebViewBridgeCore.postMessage(msg);
        }
   }

   function _callAndroidNative(msg){

   }

   function _getCallbackID(){
        var date = new Date();
        var dateString = Number(date);
        return `callbackid${dateString}`;
    }

    CSJSBridgeCore.prototype.nativelog = function (data) {  
        var msgBody = {};
        msgBody.handler = 'core';
        msgBody.action = 'nativelog';
        msgBody.data = data;
        this.webCallNative(msgBody);
    }
     CSJSBridgeCore.prototype.registerNativeCall = function (action,handler) {  
        if(handler && typeof(handler) == 'function'){
            this.nativelog(`registerNativeCall action:${action} sucesss`)
            this.nativeCallMap[action] = handler;
        }
    }
    
    CSJSBridgeCore.prototype.APIConfig = function(handler){   
        var msg = {};
        msg.handler = 'core';
        msg.action = 'APIConfig';
        jsBridge.webCallNative(msg, handler);
    };
                                     
    CSJSBridgeCore.prototype.nativeCallWeb = function (action,data){
         var handler = this.nativeCallMap[action];
         if(handler){
           //不知道如何拿到js回调的结果:如以下执行调用(或者异步操作回调到native也未解决)
        //    jsCommonHandler.registerNativeCall('share',function (data) {
        //     jsCommonHandler.nativelog('callFromNative');
        //     return {};
        //   });
           // var msg = handler(data);
           handler(data);
           var msg = {};
           msg.action = action;
           msg.tip = 'jsCompletion';
           return msg;
        }
    } 
   var jsBridge = new CSJSBridgeCore();

   //callApp传递nativeCallWebFunction
   setTimeout(() => {
    jsBridge.APIConfig((data) => {
        //this变量慎用
        jsBridge.nativeJSAPIVersion = data['JSAPIVersion'];
    });
   }, 500);

   window.jsBridge = window.$ = jsBridge;
})(window);
