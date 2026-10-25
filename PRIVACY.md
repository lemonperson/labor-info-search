# Privacy

劳动信息检索 is a local Windows desktop application. It has no account system, telemetry, advertising identifier, analytics service, or API key requirement.

## What stays on this device

- Search history, settings, and cached application data are stored in the current Windows user profile, in Electron's application data folder. The database is named `labor-information.sqlite`.
- Screenshot files are selected with the Windows file picker and read locally for OCR. The app does not upload screenshots, retain the image, or save its path in search history. OCR text and candidates are shown so you can review them.
- You can turn off search-history saving in Settings and delete individual or all saved history in the app. Uninstalling leaves application data in place; delete it yourself from the application data folder if you want to remove it.

## What uses the network

When you confirm a subject and start a search, the search terms are sent to Bing's publicly accessible RSS search endpoint. Public result pages may be opened only after you confirm a specific external-browser action. Product-link recognition may request the public page you pasted for supported Taobao, JD, Douyin, or Pinduoduo URLs. Requests are not sent to an application-operated server. Those third-party services receive your network request and may process it under their own policies.

The Chinese OCR model is bundled with the application; OCR does not download language data at runtime. OCR, local storage, and viewing saved history work offline. Public search and product-page parsing need an internet connection.

## Controls and contact

The first-run disclosure explains local storage and network searches before the app accepts its first use. Search begins only after you confirm the company or keyword. You can inspect the source list in [SOURCES.md](SOURCES.md). To report a privacy concern, open a GitHub issue in this repository without attaching personal or confidential data.
