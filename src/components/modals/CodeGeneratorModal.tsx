import {useState} from 'react';
import {ActiveAuth, OpenApiSpec} from '../../types';
import CodeViewer from '../common/CodeViewer';
import {Tip} from '../common/Tooltip';
import {applyAuthToRequest} from '../../utils/auth';
import {queryStringFromPairs} from '../../utils/openapi/serialization';
import {useEscClose} from '../../hooks/useEscClose';
import {useModalTransition} from '../../hooks/useModalTransition';

interface CodeGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    spec: OpenApiSpec;
    path: string;
    method: string;
    operation: any;
    activeAuth: ActiveAuth;
}

export default function CodeGeneratorModal({
                                               isOpen,
                                               onClose,
                                               spec,
                                               path,
                                               method,
                                               operation,
                                               activeAuth
                                           }: CodeGeneratorModalProps) {
    const [selectedLang, setSelectedLang] = useState('curl');
    const {shouldRender, requestClose, backdropClassName} = useModalTransition(isOpen, onClose);
    useEscClose(isOpen, requestClose);
    if (!shouldRender)
        return null;
    const generateSnippet = (lang: string) => {
        const cleanPath = path;
        const cleanMethod = method.toUpperCase();
        const serverUrl = spec.servers?.[0]?.url || "https://api.example.com";
        switch (lang) {
            case 'curl': {
                const auth = applyAuthToRequest(spec, activeAuth, {headers: {}, query: [], cookies: []}, operation);
                const authHeaders = Object.entries(auth.headers).map(([name, value]) => ` -H "${name}: ${value}" \\\n`).join('');
                const authQuery = queryStringFromPairs(auth.query);
                const cookieHint = auth.cookies.length > 0 ? ` -b "${auth.cookies.map(cookie => `${cookie.name}=YOUR_${cookie.name.toUpperCase()}`).join('; ')}" \\\n` : activeAuth.selectedSchemes?.some(id => (spec.components?.securitySchemes as any)?.[id]?.in === 'cookie') ? ' -b "COOKIE_NAME=COOKIE_VALUE" \\\n' : '';
                return `curl -X ${cleanMethod} "${serverUrl}${cleanPath}${authQuery}" \\\n -H "Accept: application/json" \\\n${authHeaders}${cookieHint} -H "Content-Type: application/json"`;
            }
            case 'laravel':
                return `use Illuminate\\Support\\Facades\\Http;

$response = Http::withHeaders([
 'Accept' => 'application/json',
])->withCookies([
 'access_token' => 'YOUR_ISOLATED_TOKEN'
])->send('${cleanMethod}', '${serverUrl}${cleanPath}', [
]);

if ($response->successful()) {
 $data = $response->json();
}`;
            case 'go':
                return `package main

import (
 "fmt"
 "net/http"
 "io"
)

func main() {
 url := "${serverUrl}${cleanPath}"
 req, _ := http.NewRequest("${cleanMethod}", url, nil)

 req.Header.Add("Accept", "application/json")
 req.Header.Add("Cookie", "access_token=YOUR_DECRYPTED_TOKEN")

 res, err := http.DefaultClient.Do(req)
 if err != nil {
 fmt.Println(err)
 return
 }
 defer res.Body.Close()
 body, _ := io.ReadAll(res.Body)

 fmt.Println(string(body))
}`;
            case 'php':
                return `<?php
$curl = curl_init();

curl_setopt_array($curl, [
 CURLOPT_URL => "${serverUrl}${cleanPath}",
 CURLOPT_RETURNTRANSFER => true,
 CURLOPT_ENCODING => "",
 CURLOPT_MAXREDIRS => 10,
 CURLOPT_TIMEOUT => 30,
 CURLOPT_CUSTOMREQUEST => "${cleanMethod}",
 CURLOPT_HTTPHEADER => [
 "Accept: application/json",
 "Cookie: access_token=YOUR_ACCESS_TOKEN"
 ],
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
 echo "cURL Error:" . $err;
} else {
 echo $response;
}`;
            case 'js-fetch':
                return `// JS standard Fetch client code
fetch("${serverUrl}${cleanPath}", {
 method: "${cleanMethod}",
 headers: {
 "Accept": "application/json",
 "Content-Type": "application/json"
 },
 credentials: "include" // crucial for transacting standard cookie authorities
})
 .then(response => response.json())
 .then(data => console.log(data))
 .catch(error => console.error("Error:", error));`;
            case 'js-axios':
                return `// JS Axios consumer client
import axios from 'axios';

axios({
 method: '${method.toLowerCase()}',
 url: '${serverUrl}${cleanPath}',
 headers: {
 'Accept': 'application/json'
 },
 withCredentials: true // allows browser to send secure cookies automatically
})
 .then(response => {
 console.log(response.data);
 })
 .catch(error => {
 console.error(error);
 });`;
            case 'python':
                return `# Python Requests Session
import requests

url = "${serverUrl}${cleanPath}"
headers = {
 "Accept": "application/json"
}
cookies = {
 "access_token": "YOUR_ACCESS_TOKEN"
}

response = requests.request("${cleanMethod}", url, headers=headers, cookies=cookies)
print(response.json())`;
            case 'csharp':
                return `// C# HttpClient model
using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program
{
 static async Task Main()
 {
 var client = new HttpClient();
 var request = new HttpRequestMessage(HttpMethod.${method.toUpperCase() === 'DELETE' ? 'Delete' : method.toUpperCase() === 'POST' ? 'Post' : method.toUpperCase() === 'PUT' ? 'Put' : 'Get'}, "${serverUrl}${cleanPath}");

 request.Headers.Add("Accept", "application/json");
 request.Headers.Add("Cookie", "access_token=YOUR_ACCESS_TOKEN");

 var response = await client.SendAsync(request);
 response.EnsureSuccessStatusCode();
 string responseBody = await response.Content.ReadAsStringAsync();
 Console.WriteLine(responseBody);
 }
}`;
            case 'angular': {
                const bodySnippet = ['post', 'put', 'patch'].includes(method.toLowerCase()) ? `,
  body: {} // replace with your request payload` : '';
                return `// Angular HttpClient example
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = '${serverUrl}';

  constructor(private http: HttpClient) {}

  callEndpoint(): Observable<any> {
    const headers = new HttpHeaders({
      'Accept': 'application/json',
      'Content-Type': 'application/json'${activeAuth.activeScheme === 'bearer' && activeAuth.bearerToken ? `,
      'Authorization': 'Bearer ${activeAuth.bearerToken}'` : ''}
    });

    return this.http.${method.toLowerCase()}<any>(
      \`\${this.baseUrl}${cleanPath}\`${bodySnippet},
      { headers, withCredentials: true }
    );
  }
}
`;
            }
            default:
                return '';
        }
    };
    const getLanguageLabel = (lang: string) => {
        switch (lang) {
            case 'curl':
                return 'bash';
            case 'python':
                return 'python';
            case 'go':
                return 'go';
            case 'php':
            case 'laravel':
                return 'php';
            case 'csharp':
                return 'csharp';
            case 'angular':
                return 'typescript';
            default:
                return 'javascript';
        }
    };
    return (<div className={`${backdropClassName} fixed inset-0 z-[2500] bg-black/40 backdrop-blur-[2px]`}
                 onMouseDown={event => {
                     if (event.target === event.currentTarget)
                         requestClose();
                 }}>
        <div
            className="modal-surface max-h-[90vh] w-full max-w-3xl rounded-2xl border flex flex-col shadow-2xl overflow-hidden bg-[var(--surface)] border-[var(--border)]">


            <div
                className="px-4 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between border-b shrink-0 border-[var(--border)] bg-[var(--background)] gap-2 modal-header-mobile-pad">


                <div className="flex items-center gap-3 select-none">
                    <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-[var(--primary)]/10 text-[var(--primary)]">
                        <i className="ph ph-code text-lg"></i>
                    </span>
                    <div>
                        <h3 className="font-semibold text-base font-sans text-[var(--text-heading)]">
                            Code Snippet Generator
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">
                            {method.toUpperCase()} {path}
                        </p>
                    </div>
                </div>

                <Tip content="Close">
                    <button onClick={requestClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--primary-hover)] transition-all cursor-pointer text-[var(--text-muted)]">
                        <i className="ph ph-x"></i>
                    </button>
                </Tip>
            </div>


            <div className="modal-scroll-region min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div
                    className="rounded-2xl border overflow-hidden shadow-sm bg-[var(--surface)] border-[var(--border)]">


                    <div
                        className="flex border-b overflow-x-auto scrollbar-thin flex-nowrap border-[var(--border)] bg-[var(--background)]">

                        {[
                            {id: 'curl', name: 'cURL'},
                            {id: 'js-fetch', name: 'JS Fetch'},
                            {id: 'js-axios', name: 'Axios'},
                            {id: 'angular', name: 'Angular'},
                            {id: 'laravel', name: 'Laravel'},
                            {id: 'php', name: 'PHP'},
                            {id: 'python', name: 'Python'},
                            {id: 'go', name: 'Go'},
                            {id: 'csharp', name: 'C#'}
                        ].map((lang) => <button key={lang.id} onClick={() => setSelectedLang(lang.id)}
                                                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all shrink-0 whitespace-nowrap cursor-pointer ${selectedLang === lang.id ?
                                                    'border-[var(--primary)] font-bold text-[var(--primary)] bg-[var(--primary)]/5' :
                                                    'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'}`}>

                            {lang.name}
                        </button>)}
                    </div>


                    <div className="p-1 bg-transparent">
                        <CodeViewer code={generateSnippet(selectedLang)} language={getLanguageLabel(selectedLang)}
                                    maxHeight="420px"/>

                    </div>
                </div>
            </div>


            <div
                className="px-6 py-3.5 border-t flex justify-between items-center bg-[var(--background)] text-[11px] border-[var(--border)] text-[var(--text-muted)]">


                <span className="font-sans">
                    Authentication parameters fully bound inside code outputs
                </span>
                <button onClick={requestClose}
                        className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 transition-all shadow-sm active:scale-[0.98] bg-[var(--primary)]">


                    Done
                </button>
            </div>
        </div>
    </div>);
}
