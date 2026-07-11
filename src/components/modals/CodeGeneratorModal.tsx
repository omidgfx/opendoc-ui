import {useEffect, useState} from 'react';
import {ActiveAuth, OpenApiSpec} from '../../types';
import CodeViewer from '../common/CodeViewer';

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

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Generate code snippet targets
    const generateSnippet = (lang: string) => {
        const cleanPath = path;
        const cleanMethod = method.toUpperCase();
        const serverUrl = spec.servers?.[0]?.url || "https://api.example.com";

        switch (lang) {
            case 'curl': {
                const authHeader = activeAuth.activeScheme === 'bearer' && activeAuth.bearerToken ?
                    ` -H "Authorization: Bearer ${activeAuth.bearerToken}" \\\n` :
                    activeAuth.activeScheme === 'basic' && activeAuth.basicUsername ?
                        ` -H "Authorization: Basic ${btoa(`${activeAuth.basicUsername}:${activeAuth.basicPassword}`)}" \\\n` :
                        activeAuth.activeScheme === 'apikey' && activeAuth.apiKeyIn === 'header' && activeAuth.apiKeyValue ?
                            ` -H "${activeAuth.apiKeyName || 'X-API-KEY'}: ${activeAuth.apiKeyValue}" \\\n` :
                            '';
                const cookieHeader = activeAuth.activeScheme === 'cookie' ?
                    ` -b "access_token=YOUR_ACCESS_TOKEN" \\\n` :
                    '';
                return `curl -X ${cleanMethod} "${serverUrl}${cleanPath}" \\\n -H "Accept: application/json" \\\n${authHeader}${cookieHeader} -H "Content-Type: application/json"`;
            }
            case 'laravel':
                return `// Laravel Route Consumer Code
use Illuminate\\Support\\Facades\\Http;

$response = Http::withHeaders([
 'Accept' => 'application/json',
])->withCookies([
 'access_token' => 'YOUR_ISOLATED_TOKEN'
])->send('${cleanMethod}', '${serverUrl}${cleanPath}', [
 // 'json' => [ ... ]
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
 // Include Cookie authentication
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
// Vanilla PHP (cURL payload)
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
            default:
                return 'javascript';
        }
    };

    return (
        <div
            className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150">
            <div
                className="w-full max-w-3xl rounded-2xl border flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 bg-[var(--surface)] border-[var(--border)]">


                {/* Modal Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]">


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

                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--primary-hover)] transition-all cursor-pointer text-[var(--text-muted)]">


                        <i className="ph ph-x"></i>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4">
                    <div
                        className="rounded-2xl border overflow-hidden shadow-sm bg-[var(--surface)] border-[var(--border)]">

                        {/* Language Selection Bar (Horizontal scrollable) */}
                        <div
                            className="flex border-b overflow-x-auto scrollbar-thin flex-nowrap border-[var(--border)] bg-[var(--background)]">

                            {[
                                {id: 'curl', name: 'cURL'},
                                {id: 'js-fetch', name: 'JS Fetch'},
                                {id: 'js-axios', name: 'Axios'},
                                {id: 'laravel', name: 'Laravel'},
                                {id: 'php', name: 'PHP'},
                                {id: 'python', name: 'Python'},
                                {id: 'go', name: 'Go'},
                                {id: 'csharp', name: 'C#'}].map((lang) =>
                                <button
                                    key={lang.id}
                                    onClick={() => setSelectedLang(lang.id)}
                                    className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                                        selectedLang === lang.id ?
                                            'border-[var(--primary)] font-bold text-[var(--primary)] bg-[var(--primary)]/5' :
                                            'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'}`
                                    }>

                                    {lang.name}
                                </button>
                            )}
                        </div>

                        {/* Generated Code Displaybox */}
                        <div className="p-1 bg-transparent">
                            <CodeViewer
                                code={generateSnippet(selectedLang)}
                                language={getLanguageLabel(selectedLang)}
                                maxHeight="420px"/>

                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div
                    className="px-6 py-3.5 border-t flex justify-between items-center bg-[var(--background)] text-[11px] border-[var(--border)] text-[var(--text-muted)]">


                    <span className="font-sans">
                        Authentication parameters fully bound inside code outputs
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-[var(--primary-contrast)] font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 transition-all shadow-sm active:scale-[0.98] bg-[var(--primary)]">


                        Done
                    </button>
                </div>
            </div>
        </div>);

}