# CSWebViewJavascriptBridge
一个优雅的hybrid方案：native,JS端两端实现


**CSWebViewJavascriptBridge是一套hybrid方案，包括iOS端与Web端的实现，可以为UIWebView,WKWebWiew提供hybrid能力。**


整体框架如图：

1.Bridge:

![Alt text](https://github.com/dormitory219/CSWebViewJavascriptBridge/blob/master/Readme/CSJSBridge.png)

2.Handler,Action:

![Alt text](https://github.com/dormitory219/CSWebViewJavascriptBridge/blob/master/Readme/CSJSHandlers.png)

3.JS

![Alt text](https://github.com/dormitory219/CSWebViewJavascriptBridge/blob/master/Readme/web.png)


### hybrid能力分两大类
1. web主动调用native,native处理完业务逻辑后回调web，web再处理相关业务逻辑;
2. native主动调用web,web处理完业务逻辑后回调native;

在iOS端可通过UIWebView ,WKWebView进行web业务的展示，基于两种webview的native交互方法不同，本套方案中的JS-native交互使用的不是假跳转，如果native端使用UIWebView，则通过javascriptcore框架来进行hybrid交互，如果native端使用WKWebView，则通过window.webkit.messageHandlers方式来进行交互。

在本方案中，native-JS交互核心功能由CSWebViewJavascriptBridge提供，配合不同的webview提供子类化的业务定制，
比如：CSUIWebViewJavascriptBridge提供UIWebview的hybrid交互，CSWKWebViewJavascriptBridge提供WKWebview的hybrid的交互。

下面来分别讲述本方案中native调用JS，JS调用native的流程及技术实现：

## 本方案技术实现:

### 核心通信实现:

#### 1. JS调用native:
   
   JS中webCallNative方法进行JS对native的业务调用，该方法挂载在CSJSBridgeCore上，调用时传入一个callback作为回调，每次调用时生成一个callbackID与callback映射到一个map中去。然后真正调用根据native端平台的判定，调不同方法。
   
   对于iOS，由于UIWebView,WKWebView的交互通信方法不同，提供不同的交互方案，对于UIWebView，最终调用的是CSJSWebViewBridgeCore.callApp(msg)，而WKWebView调用的是window.webkit.messageHandlers.CSJSWebViewBridgeCore.postMessage(msg)
   
   以下是CSJSBridgeCore.js部分实现：

   ```
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
   ```
   
   _callIOSNative
   
   ```
  function _callIOSNative(msg){
     var isWkWebView =  window.webkit.messageHandlers.CSJSWebViewBridgeCore ? true : false;
    if(!isWkWebView){
    CSJSWebViewBridgeCore.callApp(msg);
    }else {
    window.webkit.messageHandlers.CSJSWebViewBridgeCore.postMessage(msg);
    }
   }
   
   ```

JS通过以上两个方法调用后，native端通过相应实现来接收通信：

1.UIWebView, CSUIWebViewJavascriptBridge:

**CSUIWebViewJavascriptBridge.m**

```
- (void)callApp:(id)message
{
    [super callAppNative:message];
}
```

JSContext注入

```
- (void)injectJSContext
{
    JSContext *jsContext = [self.webView valueForKeyPath:CSJSContext];
    jsContext [CSJSNativeObject] = self;
    self.jsContext = jsContext;
}
```  


protocol方法定义：与JS约定的底层通信方法callApp定义

```
@protocol CSJavaScriptProtocolExport <JSExport>

- (void)callApp:(id)message;

@end
```

```
- (instancetype)init
{
    self = [super init];
    if (self) {
        class_addProtocol([self class], @protocol(CSJavaScriptProtocolExport));
    }
    return self;
}
```

这样在UIViewView内核下CSUIWebViewJavascriptBridge就收到了JS的callApp的调用，并且通过message收到了调用数据参数，根据数据参数，native进行相关业务的调用。


2.WKWebView, CSWKWebViewJavascriptBridge:

**CSWKWebViewJavascriptBridge.m**

在WKWebView内核下CSWKWebViewJavascriptBridge通过didReceiveScriptMessage方法接收通信

```
- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message
{
    [super callAppNative:message.body];
}
```

与JS约定的对象注入

```
 WKUserContentController *userContentController = [[WKUserContentController alloc] init];
[userContentController addScriptMessageHandler:self name:CSJSNativeObject];
```

为了实现web,native两端统一的模块化开发，目前约定JS调用native根据业务模块的划分来进行调用，在JS调用时：

比如在JS端common业务，包括获取native的位置信息，用户信息，调用原生分享等等，这些统一定义为action,getLocationInfoAction,getUserInfoAction,shareAction等，均在模块commonHandler中定义，

另外调用原生showTipAction提示框，refreshAction刷新等这些均在commonUIHandler中定义，
比如:

CSJSCommonHandler.js：

```
CSJSCommonHandler.prototype = jsBridge;

CSJSCommonHandler.prototype.getUserInfo = function(callback){
    var msg = {};
    msg.handler = 'common';
    msg.action = 'getUserinfo';
    jsCommonHandler.webCallNative(msg, callback);
}

CSJSCommonHandler.prototype.getDeviceInfo = function(callback){
    var msg = {};
    msg.handler = 'common';
    msg.action = 'getDeviceInfo';
    jsCommonHandler.webCallNative(msg, callback);
}

```

如上getDeviceInfo调用：

```
jsCommonHandler.getDeviceInfo((data) => {
     
   });
```

native端根据webView类型不同，根据CSUIWebViewJavascriptBridge或者CSWKWebViewJavascriptBridge收到JS消息后，由基类CSWebViewJavascriptBridge统一处理：

callAppNative:

```
- (void)callAppNative:(id)message
{
    if ([message isKindOfClass:[NSDictionary class]])
    {
        CSJSMessage *messageBody = [CSJSMessage messageWithDictionary:message];
        if(![self checkJSMessageParameterValid:messageBody])
        {
            return;
        }
        [[CSJSBridgeActionHandlerManager shareManager] callHandler:messageBody.handler message:messageBody JSCallBackBlock:^(CSJSMessage *message) {
            
            self.nativeCallWebFunction = messageBody.nativeCallWebFunction;
           
            //有回调，处理回调:ios回调js，js中对应的对象及方法，如::bridge.callbackWeb,动态获取，非写死
            if (message.callbackID.length) {
                self.jsCallbackFunction = message.callbackFunction;
                NSString* script = [NSString stringWithFormat:@"%@('%@');", self.jsCallbackFunction,[message toJavascriptMessage]];
                CSLog(@"callJSWithScript:%@",script);
                [self callJSWithAction:message.action script:script];
            }
        }];
    }
}
```


native处理JS需要相应的业务处理，处理方案如下：

根据message中参数action,handler来选择对应模块handler中对应action来进行调用，对于如何调用handler，action来派分业务，笔者经过了几种不同的设计方案：

1. 直接对bridge类增加xxAction category来处理action；

2. 提前在load方法中注册对应action-actionName的映射，之后调用时通过actionName取映射action来进行调用；

3. 将action首先通过manager分发到对应handler模块中，再由handler模块来分发到对应的action中，handlers通过plist映射注册到manager中，actions也通过plist文件映射注册到handler中；
 
 方案一通过category来划分业务，略为粗旷，不够细；
 
 方案二通load注册，action越来越多的情况下，对程序启动不太好（load方法在pre-main阶段执行）；
 
 方案三是目前使用的方案，即提供了模块化的方案，同时也能进行懒注册，plist方式的映射，岂不赏心悦目？
 
 对于方案三，技术实现如下：
 
 1. handler由CSJSBridgeActionHandlerManager分发：
 
 **//CSJSBridgeActionHandlerManager.m**
 
 handler-handlername映射
 
 
 ```
 /**
 从CSJSSupportHandlers.plist加载所有JS调native所有handler的，并且通过handlerName,handler映射到内存中，通过动态调用handle模块

 @return <#return value description#>
 */
 
 - (NSMutableDictionary <NSString *,id<CSJSHandlerProtocol>>*)supportJSHandlersMap
{
    if (!_supportJSHandlersMap) {
        _supportJSHandlersMap = [NSMutableDictionary dictionaryWithCapacity:1];
        NSString *mapPath = [[NSBundle mainBundle] pathForResource:@"CSJSSupportHandlers" ofType:@"plist"];
        NSParameterAssert(mapPath);
        NSDictionary *map = [NSDictionary dictionaryWithContentsOfFile:mapPath];
        [map enumerateKeysAndObjectsUsingBlock:^(NSString* _Nonnull handlerName, NSString * _Nonnull handlerClassString, BOOL * _Nonnull stop) {
            Class handlerClass = NSClassFromString(handlerClassString);
            id handler = [[handlerClass alloc] init];
            if(!handler)
            {
                CSLog(@"handlerClass not exist:%@",handlerClassString);
            }
            else{
                if ([handler conformsToProtocol:@protocol(CSJSHandlerProtocol)]) {
                    //registerHandler:
                    [_supportJSHandlersMap setObject:handler forKey:handlerName];
                    CSJSHandler *jsHandler = (CSJSHandler *)handler;
                    jsHandler.handlerName = handlerName;
                }else{
                    CSLog(@"handler:%@ not conform to protocol:%@",handler, NSStringFromProtocol(@protocol(CSJSHandlerProtocol)));
                }
            }
        }];
        CSLog(@"supportJsHandlerMap:%@",_supportJSHandlersMap);
    }
    return _supportJSHandlersMap;
}
 ```
 
 handler调用
 
 ```
 - (void)callHandler:(NSString *)handlerName
            message:(CSJSMessage *)message
    JSCallBackBlock:(CSJSCallBackBlock)jsCallBackBlock
{
    id <CSJSHandlerProtocol>handler = self.supportJSHandlersMap[handlerName];
    if (!handler) {
        CSLog(@"error,handler:%@ not register",handlerName);
    }
    else
    {
        if([handler respondsToSelector:@selector(callAppAction:message:jsCallBackBlock:)])
        {
            [handler callAppAction:message.action message:message jsCallBackBlock:jsCallBackBlock];
        }
        else
        {
            NSLog(@"error,handler not respondsToSelector 'callAppActionWithMessage: '");
        }
    }
}

 ```
 
 2. action由CSHandler分发：
 
 **CSJSHandler.m**
 
 action-actionName映射
 
 ```
 /**
 从CSJSXXSupportAction.plist加载JS调native某个handler下的所有action的，并且通过actionName,action映射到内存中，通过动态调用action业务
 
 @return <#return value description#>
 */
 
 - (NSMutableDictionary <NSString *,id<CSJSActionProtocol>>*)supportJSActionsMap
{
    if (!_supportJSActionsMap) {
        _supportJSActionsMap = [NSMutableDictionary dictionaryWithCapacity:1];
        
        NSString *handlerName = [self.handlerName capitalizedStringWithLocale:[NSLocale currentLocale]];
        NSString *plistName = [[@"CSJS" stringByAppendingString:[NSString stringWithFormat:@"%@",handlerName]] stringByAppendingString:@"SupportActions"];
        NSString *mapPath = [[NSBundle mainBundle] pathForResource:plistName ofType:@"plist"];
        NSParameterAssert(mapPath);
        NSDictionary *map = [NSDictionary dictionaryWithContentsOfFile:mapPath];
        [map enumerateKeysAndObjectsUsingBlock:^(NSString* _Nonnull actionName, NSString * _Nonnull actionClassString, BOOL * _Nonnull stop) {
            Class actionClass = NSClassFromString(actionClassString);
            id action = [[actionClass alloc] init];
            if(!action)
            {
                CSLog(@"actionClass not exist:%@",actionClassString);
            }
            else{
                if ([action conformsToProtocol:@protocol(CSJSActionProtocol)]) {
                    //registerAction:
                    [_supportJSActionsMap setObject:action forKey:actionName];
                    CSJSAction *jsAction = (CSJSAction *)action;
                    jsAction.actionName = actionName;
                }else{
                    CSLog(@"action:%@ not conform to protocol:%@",action, NSStringFromProtocol(@protocol(CSJSHandlerProtocol)));
                }
            }
        }];
        NSLog(@"supportJsActiomMap:%@",_supportJSActionsMap);
    }
    return _supportJSActionsMap;
}
 
 ```
 
  3. action真正调用：
 
 ```
 /**
 JS主动调native，

 @param actionName action,如share,getUserInfo,getDeviceInfo
 @param message JS传递到native的数据
 @param jsCallBackBlock native回调到JS的Block
 */
- (void)callAppAction:(NSString *)actionName message:(CSJSMessage *)message jsCallBackBlock:(CSJSCallBackBlock)jsCallBackBlock
{
    id <CSJSActionProtocol>action = self.supportJSActionsMap[actionName];
    if (!action) {
        CSLog(@"error,action:%@ not register",actionName);
    }
    else
    {
        if([action respondsToSelector:@selector(callAppActionWithMessage:jsCallBackBlock:)])
        {
            [action callAppActionWithMessage:message jsCallBackBlock:jsCallBackBlock];
        }
        else
        {
            CSLog(@"error,action not respondsToSelector 'callAppActionWithMessage:jsCallBackBlock:'");
        }
    }
}
 ```

比如 CSGetDeviceInfoAction：

在对应action中处理业务逻辑，处理完之后jsCallBackBlock进行回调，回到CSWebViewJavascriptBridge中进行callback

**CSGetDeviceInfoAction.m**

```
- (void)callAppActionWithMessage:(CSJSMessage *)message jsCallBackBlock:(CSJSCallBackBlock)jsCallBackBlock
{
    CSJSMessage *responceMessage  = message;
    //doSth
    
    jsCallBackBlock ? jsCallBackBlock(responceMessage) : nil;
}
```

callback逻辑如下：

**CSWebViewJavascriptBridge.m**

```
 [[CSJSBridgeActionHandlerManager shareManager] callHandler:messageBody.handler message:messageBody JSCallBackBlock:^(CSJSMessage *message) {
        if (message.callbackID.length) {
            self.jsCallbackFunction = message.callbackFunction;
            NSString* script = [NSString stringWithFormat:@"%@('%@');", self.jsCallbackFunction,[message toJavascriptMessage]];
            CSLog(@"callJSWithScript:%@",script);
            [self callJSWithAction:message.action script:script];
        }
   }];
```

callJSWithAction即是native调JS方法，在UIWebView，WKWebView中不同实现，
比如UIWebView中

```
[self.jsContext evaluateScript:script];

```
该callJSWithAction最终调用JS，调用方法为

```
jsBridge.callBackWeb(msg);
```

此时在JS端收到通信调用,大致思路为从之前的callbackID-callback映射map中根据callbackID取出callback,进行callback调用，如此整个JS-Native-JS的整个调用流程结束。是不是很酸爽？

**CSJSBridgeCore.js**

```
CSJSBridgeCore.prototype.callbackWeb = function(data){
    var message = JSON.parse(data);
    var callbackID = message['callbackID'];
    var callback = this.msgCallbackMap[callbackID];
    if(callback){
        callback(message);
    }
};
```


#### 2. native调用JS:
  这类业务普遍是native端提供相关事件，web端对native的事件进行注册监听。native一旦事件触发，web端对监听的事件进行响应。
  一般监听事件两种：
  
  1. 为webViewController lifeCycle等方法，如viewWillAppear,viewDidAppear,
  2. 为系统application事件，包括ApplicationWillEnterForeground,ApplicationDidEnterBackground,ApplicationWillResignActive,ApplicationDidBecomeActiv等事件。

  #### 调用流程：
  
  1. native端：对以上两类事件进行监听：
  
  **CSWebBrowViewController.m**
  
  ```
  - (void)addViewControllerlifeCycleEvents
{
    [self.bridge listenEvent:CSJSWebViewWillAppearEvent eventDispatchBlock:^(id data) {
        [self.bridge callJS:CSJSWebViewWillAppearEvent message:nil JSCompletionBlock:^(id message) {
            
        }];
    }];
    [self.bridge listenEvent:CSJSWebViewDidAppearEvent eventDispatchBlock:^(id data) {
        [self.bridge callJS:CSJSWebViewDidAppearEvent message:nil JSCompletionBlock:^(id message) {
            
        }];
    }];
    ******
}

  ```
  
  
  ```
  - (void)addApplicationNotificationEvents
{
    [self.bridge listenApplicationEvent:UIApplicationWillEnterForegroundNotification eventDispatchBlock:^(id data) {
        [self.bridge callJS:UIApplicationWillEnterForegroundNotification message:nil JSCompletionBlock:^(id message) {
            
        }];
    }];

    
    [self.bridge listenApplicationEvent:UIApplicationDidBecomeActiveNotification eventDispatchBlock:^(id data) {
        [self.bridge callJS:UIApplicationDidBecomeActiveNotification message:nil JSCompletionBlock:^(id message) {
            
        }];
    }];
}
  
  ```
  
  事件触发后通知JS端,调用JS约定方法：
  
  ```
  [self.bridge callJS:UIApplicationDidBecomeActiveNotification message:nil JSCompletionBlock:^(id message) {
            
        }];
  ```
  
  
  ```
  jsBridge.nativeCallWeb(msg)
  
  ```
  
  2. 在JS端的nativeCallWeb实现:
  
  从nativeCallMap中取出对应监听事件event的function，进行回调，当然前提是JS端对该
  event事件进行了注册监听，其实这个思路和JS端调用native的callback逻辑类似。
  
  ```
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
  ```
  
   JS注册native监听事件方法：
   
   ```
    CSJSBridgeCore.prototype.registerNativeCall = function (action,handler) {  
    if(handler && typeof(handler) == 'function'){
        this.nativelog(`registerNativeCall action:${action} sucesss`)
        this.nativeCallMap[action] = handler;
    }
  }
    
   ```

   至此，native-JS流程结束。

### 其它
#### 1.两端模块化定义：

  JS调用native的业务，我们希望通过两端都一致用模块化的思路去定义，一个 JS调用native的事件，我们定义它是在xx模块（handler）中的xxAction。
    
  JS端：
  
  如commonHandler为一个模块，该模块定义常规性的调用native的操作，比如调起分享action，获取用户信息数据action，获取设备信息action等;
  coreHandler为一个最底层模块，目前只有logAction;
 
 
  ```
  CSJSCommonHandler.prototype.getDeviceInfo = function(callback){
        var msg = {};
        msg.handler = 'common';
        msg.action = 'getDeviceInfo';
        jsCommonHandler.webCallNative(msg, callback);
    } 
  ```
  而对应在native端：
  
  由CSJSCommonHandler模块来处理该模块action，具体action由handler分发到对应action来处理业务：
  CSJSShareAction，CSGetDeviceInfoAction
  
  
#### 2.native调用JS时方法的动态化：
  该方案中在native中对JS的调用有两处，一处是JS主动调用native，native处理业务之后回调JS，此时会调用JS的callback方法，二处是native主动向JS发送native事件callweb。native端这样直接调用JS，不免会有硬编码的诟病，而且一旦JS端方法发生变化，native端是完全无感知的，所以，方案里是使用了另外一种方式。native调JS的方法是通过JS传递给native端的，native端保存之后再进行相关调用。
 
 如下的nativeCallWebFunction，callbackFunction便是从JS传递数据解析过来的：
 
  
  ```
  - (void)callAppNative:(id)message
{
    if ([message isKindOfClass:[NSDictionary class]])
    {
        [[CSJSBridgeActionHandlerManager shareManager] callHandler:messageBody.handler message:messageBody JSCallBackBlock:^(CSJSMessage *message) {
            
            self.nativeCallWebFunction = messageBody.nativeCallWebFunction;
           
            //有回调，处理回调:ios回调js，js中对应的对象及方法，如::bridge.callbackWeb,动态获取，非写死
            if (message.callbackID.length) {
                self.jsCallbackFunction = message.callbackFunction;
                NSString* script = [NSString stringWithFormat:@"%@('%@');", self.jsCallbackFunction,[message toJavascriptMessage]];
            }
        }];
    }
}

  ```
  
#### 3.log调试：
  之前在项目中老的JS-native通信中经常遇到一些问题很难调试，native端无法知道JS调用的结果异常与否，所以在corehandler里加了logAction来帮助将JS端的log直接输出到native端。
   
   JS端：
   
   ```
   CSJSBridgeCore.prototype.nativelog = function (data) {  
    var msgBody = {};
    msgBody.handler = 'core';
    msgBody.action = 'nativelog';
    msgBody.data = data;
    this.webCallNative(msgBody);
    }
   ```
   
   native端：
   
   
   **CSJSLogAction.m**
   
   ```
   - (void)callAppActionWithMessage:(CSJSMessage *)message jsCallBackBlock:(CSJSCallBackBlock)jsCallBackBlock
{
    CSJSMessage *responceMessage  = message;
    NSDictionary *dic = [responceMessage toDictionary];
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:dic options:NSJSONWritingPrettyPrinted error:nil];
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    CSLog([[@"<<\n fromJslog: " stringByAppendingString:jsonString] stringByAppendingString:@"\n>>"]);
    jsCallBackBlock ? jsCallBackBlock(responceMessage) : nil;
}
   ```
   
   
#### 4.关于JS端依赖模块的编写：
   本方案中JS端核心代码为CSJSBridgeCore.js文件，JS端新模块业务直接调用CSJSBridgeCore的方法，参照模块为CSJSCommonHandler.js。
   CSJSBridgeCore.js的使用有两种方式：
   
   1. 可由web页面script标签引入；
   2. 可提前在native端执行；
   
CSWebViewJavascriptBridge使用的是第二种。
   
目前CSJSBridgeCore.js的编程思想，整个文件为一个执行闭包，核心对象为CSJSBridgeCore，挂载在window上的一个全局对象。对于现在web的SPA应用开发，这并不是标准的模块化编程方式。这一块可在之后使用es6的模块化方式进行书写，支持npm。
    


------
本文的主要思路来自于味精的两篇文章，

http://awhisper.github.io/2018/01/02/hybrid-jscomunication/

http://awhisper.github.io/2018/03/06/hybrid-webcontainer/

配合这两篇文章，再结合这套源码，hybrid这套，似乎没什么难的了。
   

 
 
    
    
    
    
    
    
    
    
    
    
    
