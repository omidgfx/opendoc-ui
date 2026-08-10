import type {ActiveAuth, OpenApiSpec, Operation} from '../types';
import {normalizeActiveAuth} from './auth';
import {getMergedParameters, resolveRequestBody} from './openapi';
import {compileBrowserRequest, parameterStateKey} from './requestPlan';
import {generateValidatedMock} from './mockGenerator';

export type CodeLanguage =
    'curl' | 'js-fetch' | 'js-axios' | 'angular' | 'laravel' | 'php' | 'python' | 'go' | 'csharp';

interface CodegenRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    cookies: Array<{name: string; value: string}>;
    body?: string;
    bodyType?: string;
    bodyKind?: 'raw' | 'urlencoded' | 'multipart' | 'binary' | 'none';
}

const placeholder = (name: string) =>
    `YOUR_${
        String(name)
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toUpperCase() || 'VALUE'
    }`;
const SECRET_NAME =
    /(authorization|api[-_ ]?key|token|secret|password|passwd|cookie|credential|private[-_ ]?key|client[-_ ]?secret)/i;
const redactExampleSecrets = (value: unknown, key = '', seen = new WeakSet<object>()): unknown => {
    if (key && SECRET_NAME.test(key)) return placeholder(key);
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    if (Array.isArray(value)) return value.map(item => redactExampleSecrets(item, key, seen));
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
            childKey,
            redactExampleSecrets(child, childKey, seen),
        ]),
    );
};

const placeholderAuth = (auth: ActiveAuth): ActiveAuth => {
    const normalized = normalizeActiveAuth(auth);
    return {
        ...normalized,
        bearerToken: 'YOUR_ACCESS_TOKEN',
        apiKeyValue: 'YOUR_API_KEY',
        basicUsername: 'YOUR_USERNAME',
        basicPassword: 'YOUR_PASSWORD',
        cookieValues: Object.fromEntries(Object.keys(normalized.cookieValues).map(name => [name, placeholder(name)])),
        schemeValues: Object.fromEntries(
            Object.entries(normalized.schemeValues).map(([id, credential]) => [
                id,
                {
                    ...credential,
                    value:
                        credential.type === 'bearer' ||
                        credential.type === 'oauth2' ||
                        credential.type === 'openIdConnect'
                            ? 'YOUR_ACCESS_TOKEN'
                            : credential.type === 'apiKey' || credential.type === 'cookie'
                              ? placeholder(credential.name || id)
                              : credential.value,
                    username: credential.type === 'basic' ? 'YOUR_USERNAME' : credential.username,
                    password: credential.type === 'basic' ? 'YOUR_PASSWORD' : credential.password,
                },
            ]),
        ),
    };
};

const firstExample = (parameter: any): unknown => {
    const named = Object.values(parameter.examples || {})[0] as any;
    return (
        parameter.example ?? named?.dataValue ?? named?.value ?? parameter.schema?.example ?? parameter.schema?.default
    );
};

const bodyPreview = (spec: OpenApiSpec, operation: Operation): {body?: string; bodyType?: string} => {
    const body = resolveRequestBody(operation.requestBody, spec);
    const bodyType = Object.keys(body?.content || {})[0];
    if (!bodyType) return {};
    const media = body.content[bodyType];
    const named = Object.values(media.examples || {})[0] as any;
    const explicit = media.example ?? named?.dataValue ?? named?.value;
    if (explicit !== undefined) {
        const redacted = redactExampleSecrets(explicit);
        return {body: typeof redacted === 'string' ? redacted : JSON.stringify(redacted, null, 2), bodyType};
    }
    if (media.schema !== undefined) {
        const generated = generateValidatedMock(media.schema, spec, 'request');
        if (generated.ok) return {body: JSON.stringify(redactExampleSecrets(generated.value), null, 2), bodyType};
    }
    return {body: bodyType.includes('json') ? '{}' : '', bodyType};
};

export const buildCodegenRequest = (input: {
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: Operation;
    selectedServer: string;
    activeAuth: ActiveAuth;
}): CodegenRequest => {
    const pathItem = input.spec.paths?.[input.path] || {};
    const parameterValues: Record<string, unknown> = {};
    getMergedParameters(pathItem, input.operation, input.spec).forEach((parameter: any) => {
        const schema = parameter.schema ?? parameter;
        let value = SECRET_NAME.test(parameter.name) ? placeholder(parameter.name) : firstExample(parameter);
        if (value === undefined) {
            if (schema?.type === 'array') value = [placeholder(`${parameter.name}_ITEM`)];
            else if (schema?.type === 'object') value = {[placeholder('KEY')]: placeholder('VALUE')};
            else value = placeholder(parameter.name);
        }
        parameterValues[parameterStateKey(parameter.in, parameter.name)] = value;
    });
    const preview = bodyPreview(input.spec, input.operation);
    const plan = compileBrowserRequest({
        ...input,
        activeAuth: placeholderAuth(input.activeAuth),
        parameterValues,
        body: preview.body,
        bodyType: preview.bodyType,
    });
    return {
        method: plan.method,
        url: plan.url,
        headers: plan.headers,
        cookies: plan.intent.cookies.map(cookie => ({name: cookie.name, value: cookie.value})),
        body: plan.body === null ? undefined : typeof plan.body === 'string' ? plan.body : preview.body,
        bodyType: preview.bodyType,
        bodyKind: plan.intent.body.kind,
    };
};

const shell = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const json = (value: unknown) => JSON.stringify(value);
const indent = (text: string, spaces: number) =>
    text
        .split('\n')
        .map(line => `${' '.repeat(spaces)}${line}`)
        .join('\n');
const parsedBody = (request: CodegenRequest): unknown => {
    if (!request.body) return undefined;
    try {
        return JSON.parse(request.body);
    } catch {
        return request.body;
    }
};
const multipartFields = (request: CodegenRequest): Record<string, unknown> => {
    const value = parsedBody(request);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

const curlSnippet = (request: CodegenRequest): string => {
    const lines = [`curl --request ${request.method} ${shell(request.url)}`];
    Object.entries(request.headers).forEach(([name, value]) => lines.push(`  --header ${shell(`${name}: ${value}`)}`));
    if (request.cookies.length)
        lines.push(`  --cookie ${shell(request.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '))}`);
    if (request.bodyKind === 'multipart' && request.body) {
        const value = parsedBody(request);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value as Record<string, unknown>).forEach(([name, item]) => {
                const rendered = /file|upload|image|document/i.test(name)
                    ? `@/path/to/${name}`
                    : typeof item === 'object'
                      ? `${JSON.stringify(item)};type=application/json`
                      : String(item ?? '');
                lines.push(`  --form ${shell(`${name}=${rendered}`)}`);
            });
        }
    } else if (request.body !== undefined) {
        lines.push(`  --data-raw ${shell(request.body)}`);
    }
    return lines.join(' \\\n');
};

const fetchSnippet = (request: CodegenRequest): string => {
    const options: string[] = [
        `method: ${json(request.method)}`,
        `headers: ${JSON.stringify(request.headers, null, 2)}`,
    ];
    let prelude = '';
    if (request.bodyKind === 'multipart' && request.body) {
        prelude = `const form = new FormData();\nconst fields = ${JSON.stringify(parsedBody(request), null, 2)};\nfor (const [name, value] of Object.entries(fields)) {\n  form.append(name, typeof value === 'object' ? JSON.stringify(value) : String(value));\n}\n// For binary fields: form.set('file', fileInput.files[0]);\n\n`;
        options.push('body: form');
    } else if (request.body !== undefined) {
        options.push(`body: ${json(request.body)}`);
    }
    if (request.cookies.length) options.push(`credentials: "include" // Browser sends only browser-managed cookies`);
    return `${prelude}const response = await fetch(${json(request.url)}, {\n${indent(options.join(',\n'), 2)}\n});\n\nconst text = await response.text();\nconsole.log(response.status, text);`;
};

const axiosSnippet = (request: CodegenRequest): string => {
    const body = parsedBody(request);
    const multipart = request.bodyKind === 'multipart' && body && typeof body === 'object';
    const prelude = multipart
        ? `const form = new FormData();\nfor (const [name, value] of Object.entries(${JSON.stringify(body, null, 2)}))\n  form.append(name, typeof value === 'object' ? JSON.stringify(value) : String(value));\n\n`
        : '';
    return `import axios from 'axios';\n\n${prelude}const response = await axios.request({\n  method: ${json(request.method.toLowerCase())},\n  url: ${json(request.url)},\n  headers: ${JSON.stringify(request.headers, null, 2).split('\n').join('\n  ')}${body !== undefined ? `,\n  data: ${multipart ? 'form' : JSON.stringify(body, null, 2).split('\n').join('\n  ')}` : ''}${request.cookies.length ? ',\n  withCredentials: true // Browser-managed cookies only' : ''}\n});\n\nconsole.log(response.status, response.data);`;
};

const pythonSnippet = (request: CodegenRequest): string => {
    const body = parsedBody(request);
    const multipart = request.bodyKind === 'multipart' && body && typeof body === 'object' && !Array.isArray(body);
    const multipartPrelude = multipart
        ? `fields = ${JSON.stringify(body, null, 2)}\nfiles = {name: open(f"/path/to/{name}", "rb") for name in fields if "file" in name.lower()}\ndata = {name: value for name, value in fields.items() if name not in files}\n\n`
        : '';
    return `import requests\n\n${multipartPrelude}response = requests.request(\n    ${json(request.method)},\n    ${json(request.url)},\n    headers=${JSON.stringify(request.headers, null, 2).replace(/true/g, 'True').replace(/false/g, 'False').replace(/null/g, 'None')},${request.cookies.length ? `\n    cookies=${JSON.stringify(Object.fromEntries(request.cookies.map(cookie => [cookie.name, cookie.value])), null, 2)},` : ''}${multipart ? '\n    data=data,\n    files=files,' : request.body !== undefined ? `\n    data=${json(request.body)},` : ''}\n    timeout=30,\n)\nprint(response.status_code)\nprint(response.text)`;
};

const phpArray = (record: Record<string, string>) =>
    `[${Object.entries(record)
        .map(([key, value]) => `\n        ${json(key)} => ${json(value)},`)
        .join('')}\n    ]`;
const phpSnippet = (request: CodegenRequest): string => {
    const multipart = request.bodyKind === 'multipart';
    const fields = multipartFields(request);
    const multipartValue = multipart
        ? `[${Object.entries(fields)
              .map(([name, value]) =>
                  /file|upload|image|document/i.test(name)
                      ? `\n        ${json(name)} => new CURLFile('/path/to/${name}'),`
                      : `\n        ${json(name)} => ${json(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''))},`,
              )
              .join('')}\n    ]`
        : null;
    return `<?php\n$ch = curl_init(${json(request.url)});\ncurl_setopt_array($ch, [\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_CUSTOMREQUEST => ${json(request.method)},\n    CURLOPT_HTTPHEADER => array_map(fn($k, $v) => "$k: $v", array_keys(${phpArray(request.headers)}), ${phpArray(request.headers)}),${request.cookies.length ? `\n    CURLOPT_COOKIE => ${json(request.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '))},` : ''}${multipartValue ? `\n    CURLOPT_POSTFIELDS => ${multipartValue},` : request.body !== undefined ? `\n    CURLOPT_POSTFIELDS => ${json(request.body)},` : ''}\n]);\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);\ncurl_close($ch);\necho $status . "\\n" . $response;`;
};

const goSnippet = (request: CodegenRequest): string => {
    if (request.bodyKind === 'multipart') {
        const fields = multipartFields(request);
        const fieldLines = Object.entries(fields)
            .map(([name, value]) =>
                /file|upload|image|document/i.test(name)
                    ? `    file, _ := os.Open("/path/to/${name}")\n    defer file.Close()\n    part, _ := writer.CreateFormFile(${json(name)}, filepath.Base(file.Name()))\n    io.Copy(part, file)`
                    : `    writer.WriteField(${json(name)}, ${json(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''))})`,
            )
            .join('\n');
        return `package main\n\nimport (\n    "bytes"\n    "fmt"\n    "io"\n    "mime/multipart"\n    "net/http"\n    "os"\n    "path/filepath"\n)\n\nfunc main() {\n    var payload bytes.Buffer\n    writer := multipart.NewWriter(&payload)\n${fieldLines}\n    writer.Close()\n    req, err := http.NewRequest(${json(request.method)}, ${json(request.url)}, &payload)\n    if err != nil { panic(err) }\n${Object.entries(
            request.headers,
        )
            .map(([name, value]) => `    req.Header.Set(${json(name)}, ${json(value)})`)
            .join(
                '\n',
            )}\n    req.Header.Set("Content-Type", writer.FormDataContentType())${request.cookies.map(cookie => `\n    req.AddCookie(&http.Cookie{Name: ${json(cookie.name)}, Value: ${json(cookie.value)}})`).join('')}\n    response, err := http.DefaultClient.Do(req)\n    if err != nil { panic(err) }\n    defer response.Body.Close()\n    body, _ := io.ReadAll(response.Body)\n    fmt.Println(response.StatusCode, string(body))\n}`;
    }
    return `package main\n\nimport (\n    "fmt"\n    "io"\n    "net/http"\n    "strings"\n)\n\nfunc main() {\n    req, err := http.NewRequest(${json(request.method)}, ${json(request.url)}, ${request.body !== undefined ? `strings.NewReader(${json(request.body)})` : 'nil'})\n    if err != nil { panic(err) }\n${Object.entries(
        request.headers,
    )
        .map(([name, value]) => `    req.Header.Set(${json(name)}, ${json(value)})`)
        .join(
            '\n',
        )}${request.cookies.map(cookie => `\n    req.AddCookie(&http.Cookie{Name: ${json(cookie.name)}, Value: ${json(cookie.value)}})`).join('')}\n    response, err := http.DefaultClient.Do(req)\n    if err != nil { panic(err) }\n    defer response.Body.Close()\n    body, _ := io.ReadAll(response.Body)\n    fmt.Println(response.StatusCode, string(body))\n}`;
};

const csharpSnippet = (request: CodegenRequest): string => {
    const multipart = request.bodyKind === 'multipart';
    const fields = multipartFields(request);
    const content = multipart
        ? `\nusing var multipart = new MultipartFormDataContent();\n${Object.entries(fields)
              .map(([name, value]) =>
                  /file|upload|image|document/i.test(name)
                      ? `multipart.Add(new StreamContent(File.OpenRead("/path/to/${name}")), ${json(name)}, ${json(name)});`
                      : `multipart.Add(new StringContent(${json(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''))}), ${json(name)});`,
              )
              .join('\n')}\nrequest.Content = multipart;`
        : request.body !== undefined
          ? `\nrequest.Content = new StringContent(${json(request.body)}, Encoding.UTF8, ${json(request.bodyType || 'text/plain')});`
          : '';
    return `using System.IO;\nusing System.Net.Http;\nusing System.Text;\n\nusing var client = new HttpClient();\nusing var request = new HttpRequestMessage(new HttpMethod(${json(request.method)}), ${json(request.url)});\n${Object.entries(
        request.headers,
    )
        .map(([name, value]) => `request.Headers.TryAddWithoutValidation(${json(name)}, ${json(value)});`)
        .join(
            '\n',
        )}${request.cookies.length ? `\nrequest.Headers.TryAddWithoutValidation("Cookie", ${json(request.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '))});` : ''}${content}\nusing var response = await client.SendAsync(request);\nConsole.WriteLine((int)response.StatusCode);\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;
};

const angularSnippet = (request: CodegenRequest): string => {
    const multipart = request.bodyKind === 'multipart';
    const body = parsedBody(request);
    const prelude = multipart
        ? `const form = new FormData();\nfor (const [name, value] of Object.entries(${JSON.stringify(multipartFields(request), null, 2)}))\n  form.append(name, typeof value === 'object' ? JSON.stringify(value) : String(value));\n// Replace binary fields with File objects from an input.\n\n`
        : '';
    return `import { HttpClient, HttpHeaders } from '@angular/common/http';\nimport { inject } from '@angular/core';\n\n${prelude}const http = inject(HttpClient);\nconst response = await http.request(${json(request.method)}, ${json(request.url)}, {\n  headers: new HttpHeaders(${JSON.stringify(request.headers, null, 2).split('\n').join('\n  ')}),${body !== undefined ? `\n  body: ${multipart ? 'form' : JSON.stringify(body, null, 2).split('\n').join('\n  ')},` : ''}${request.cookies.length ? '\n  withCredentials: true, // Browser-managed cookies only' : ''}\n  observe: 'response',\n}).toPromise();\n\nconsole.log(response?.status, response?.body);`;
};

const laravelSnippet = (request: CodegenRequest): string => {
    const fields = multipartFields(request);
    const multipart = request.bodyKind === 'multipart';
    const attachments = multipart ? Object.keys(fields).filter(name => /file|upload|image|document/i.test(name)) : [];
    const data = multipart
        ? Object.fromEntries(Object.entries(fields).filter(([name]) => !attachments.includes(name)))
        : {};
    return `use Illuminate\\Support\\Facades\\Http;\n\n$request = Http::withHeaders(${phpArray(request.headers)})${request.cookies.length ? `\n    ->withCookies(${phpArray(Object.fromEntries(request.cookies.map(cookie => [cookie.name, cookie.value])))}, parse_url(${json(request.url)}, PHP_URL_HOST))` : ''}${attachments.map(name => `\n    ->attach(${json(name)}, fopen('/path/to/${name}', 'r'), ${json(name)})`).join('')};\n$response = $request->send(${json(request.method)}, ${json(request.url)}${multipart ? `, ['form_params' => ${phpArray(Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')])))}]` : request.body !== undefined ? `, ['body' => ${json(request.body)}]` : ''});\n\ndump($response->status(), $response->body());`;
};

export const generateRequestSnippet = (language: CodeLanguage, request: CodegenRequest): string => {
    switch (language) {
        case 'curl':
            return curlSnippet(request);
        case 'js-fetch':
            return fetchSnippet(request);
        case 'js-axios':
            return axiosSnippet(request);
        case 'python':
            return pythonSnippet(request);
        case 'php':
            return phpSnippet(request);
        case 'go':
            return goSnippet(request);
        case 'csharp':
            return csharpSnippet(request);
        case 'angular':
            return angularSnippet(request);
        case 'laravel':
            return laravelSnippet(request);
    }
};
