/** The guided question steps and the review summary. */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from './paths.mjs';
import {note, section, ui, warning, hline} from './ui.mjs';
import {portInUse} from './docker.mjs';
import {cloneConfig} from './config.mjs';
import {
    isOrigin,
    isPort,
    validateBasePath,
    validateDownloaderTemplate,
    validateModel,
    validateOrigins,
    validateToken,
} from './validators.mjs';
import {randomBytes} from 'node:crypto';

export async function stepProfile(prompter, existing) {
    const {select, confirm, ask} = prompter;
    section('Deployment profile');
    const profile = await select(
        'What are you building for?',
        [
            {value: 'static', label: 'Static files only', hint: 'dist/ for GitHub Pages, Netlify, nginx, S3'},
            {value: 'docker', label: 'Docker image', hint: 'compose.yaml / docker build'},
            {value: 'both', label: 'Both', hint: 'static files + Docker image (recommended)'},
        ],
        {defaultIndex: ['static', 'docker', 'both'].indexOf(existing?.profile ?? 'both')},
    );
    const clean = await confirm('Clean the previous build output before building?', existing?.clean ?? true);
    const deploymentOrigin = await ask('Public application origin (used for gateway origins; empty to skip)', {
        default: existing?.deploymentOrigin || '',
        validate: value => (value === '' || isOrigin(value) ? true : 'Enter a valid origin (https://host, no path).'),
    });
    return {profile, clean, deploymentOrigin: deploymentOrigin || null};
}

export async function stepFrontend(prompter, existing) {
    const {select, ask, confirm} = prompter;
    section('Frontend build options');
    const disableAppleEmojis =
        (await select(
            'Apple Emoji sprite?',
            [
                {value: true, label: 'Exclude', hint: 'leaner bundle (default)'},
                {value: false, label: 'Include', hint: 'consistent Apple rendering, larger bundle'},
            ],
            {defaultIndex: existing?.disableAppleEmojis === false ? 1 : 0},
        )) === true;
    const basePath = await ask('Base path', {default: existing?.basePath ?? '/', validate: validateBasePath});
    const loadFromUrl = await confirm(
        'Enable "Load from URL" for remote specifications?',
        existing?.loadFromUrl ?? false,
    );
    return {disableAppleEmojis, basePath, loadFromUrl};
}

export async function stepDownloadProxy(prompter, existing) {
    const {ask, confirm, select} = prompter;
    const result = {
        downloaderTemplate: existing?.downloaderTemplate ?? null,
        proxyExample: existing?.proxyExample ?? 'none',
    };
    const wantsTemplate = result.downloaderTemplate
        ? await confirm(`Keep the downloader proxy template "${result.downloaderTemplate}"?`, true)
        : await confirm('Configure a downloader proxy template?', false);
    if (wantsTemplate && !result.downloaderTemplate) {
        result.downloaderTemplate = await ask(
            'Proxy URL template (exactly one {URL}, e.g. https://proxy.example.com/download?spec_url={URL})',
            {validate: validateDownloaderTemplate},
        );
    } else if (!wantsTemplate) {
        result.downloaderTemplate = null;
    }
    if (result.downloaderTemplate) {
        result.proxyExample = await select(
            'Copy an example proxy service configuration?',
            [
                {value: 'none', label: 'No'},
                {value: 'node', label: 'Node.js'},
                {value: 'python', label: 'Python (FastAPI)'},
                {value: 'php', label: 'PHP (Laravel)'},
                {value: 'go', label: 'Go'},
                {value: 'java', label: 'Java (Spring Boot)'},
                {value: 'dotnet', label: '.NET (ASP.NET Core)'},
            ],
            {
                defaultIndex: Math.max(
                    0,
                    ['none', 'node', 'python', 'php', 'go', 'java', 'dotnet'].indexOf(result.proxyExample),
                ),
            },
        );
        if (result.proxyExample !== 'none' && !existsSync(join(ROOT, 'proxy', 'config.env.example'))) {
            warning('No proxy/config.env.example found; skipping the example copy.');
            result.proxyExample = 'none';
        }
    } else {
        result.proxyExample = 'none';
    }
    return result;
}

export async function stepAiGateway(prompter, existing, deploymentOrigin) {
    const {ask, askHidden, confirm, select} = prompter;
    const gateway = {...cloneConfig().aiGateway, ...(existing?.aiGateway || {})};
    section('AI gateway');
    gateway.enabled = await confirm('Configure the server-side AI gateway?', gateway.enabled);
    if (!gateway.enabled) return gateway;
    gateway.provider = await select(
        'Provider',
        [
            {value: 'openrouter', label: 'OpenRouter'},
            {value: 'openai', label: 'OpenAI'},
            {value: 'anthropic', label: 'Anthropic'},
            {value: 'ollama', label: 'Ollama (local)'},
            {value: 'custom', label: 'Custom (OpenAI-compatible)'},
        ],
        {
            defaultIndex: Math.max(
                0,
                ['openrouter', 'openai', 'anthropic', 'ollama', 'custom'].indexOf(gateway.provider),
            ),
        },
    );
    gateway.model = await ask('Model (e.g. gpt-4o-mini, llama3.2)', {
        default: gateway.model || '',
        validate: validateModel,
    });
    gateway.baseUrl = await ask('Base URL (optional; provider default when empty)', {
        default: gateway.baseUrl || '',
        validate: value => (value === '' || /^https?:\/\/.+\..+/.test(value) ? true : 'Enter a valid http(s) URL.'),
    });
    const keepKey = gateway.apiKey ? await confirm('Keep the stored API key from .env?', true) : false;
    if (!keepKey) gateway.apiKey = await askHidden('API key (optional for local providers)', {validate: () => true});
    const token = await ask('Gateway token (Enter to auto-generate)', {
        default: gateway.token || randomBytes(24).toString('hex'),
        validate: validateToken,
    });
    gateway.token = token;
    const origins = [
        deploymentOrigin || (existing?.deploymentOrigin ?? null),
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]
        .filter(Boolean)
        .join(',');
    gateway.origins = await ask('Allowed browser origins (comma-separated)', {
        default: existing?.aiGateway?.origins || origins,
        validate: validateOrigins,
    });
    gateway.port = Number(
        await ask('Gateway port', {
            default: gateway.port || 8787,
            validate: value => (isPort(value) ? true : 'Enter a valid TCP port (1-65535).'),
        }),
    );
    if (await confirm('Adjust advanced gateway limits?', false)) {
        gateway.rateLimit = Number(
            await ask('Rate limit (requests per window)', {
                default: gateway.rateLimit,
                validate: value => (Number(value) >= 1 ? true : 'Must be at least 1.'),
            }),
        );
        gateway.maxConcurrent = Number(
            await ask('Max concurrent requests', {
                default: gateway.maxConcurrent,
                validate: value => (Number(value) >= 1 ? true : 'Must be at least 1.'),
            }),
        );
        gateway.maxMessages = Number(
            await ask('Max messages per conversation', {
                default: gateway.maxMessages,
                validate: value => (Number(value) >= 1 ? true : 'Must be at least 1.'),
            }),
        );
        gateway.maxMessageChars = Number(
            await ask('Max characters per message', {
                default: gateway.maxMessageChars,
                validate: value => (Number(value) >= 1000 ? true : 'Must be at least 1000.'),
            }),
        );
        gateway.maxContextChars = Number(
            await ask('Max context characters', {
                default: gateway.maxContextChars,
                validate: value => (Number(value) >= 10000 ? true : 'Must be at least 10000.'),
            }),
        );
        gateway.maxOutputTokens = Number(
            await ask('Max output tokens', {
                default: gateway.maxOutputTokens,
                validate: value => (Number(value) >= 256 ? true : 'Must be at least 256.'),
            }),
        );
        gateway.upstreamTimeoutMs = Number(
            await ask('Upstream timeout (ms)', {
                default: gateway.upstreamTimeoutMs,
                validate: value => (Number(value) >= 5000 ? true : 'Must be at least 5000.'),
            }),
        );
    }
    gateway.aiProxyExample = await select(
        'Copy an example AI gateway service for another framework?',
        [
            {value: 'none', label: 'No — use the built-in Node gateway (npm run ai-gateway)'},
            {value: 'express', label: 'Node.js (Express)'},
            {value: 'fastapi', label: 'Python (FastAPI)'},
            {value: 'django', label: 'Python (Django)'},
            {value: 'laravel', label: 'PHP (Laravel)'},
            {value: 'rails', label: 'Ruby (Rails)'},
            {value: 'spring-boot', label: 'Java (Spring Boot)'},
            {value: 'aspnet-core', label: '.NET (ASP.NET Core)'},
            {value: 'gin', label: 'Go (Gin)'},
            {value: 'axum', label: 'Rust (Axum)'},
        ],
        {
            defaultIndex: Math.max(
                0,
                [
                    'none',
                    'express',
                    'fastapi',
                    'django',
                    'laravel',
                    'rails',
                    'spring-boot',
                    'aspnet-core',
                    'gin',
                    'axum',
                ].indexOf(gateway.aiProxyExample),
            ),
        },
    );
    if (gateway.aiProxyExample !== 'none' && !existsSync(join(ROOT, 'ai-proxy', 'config.env.example'))) {
        warning('No ai-proxy/config.env.example found; skipping the example copy.');
        gateway.aiProxyExample = 'none';
    }
    return gateway;
}

export async function stepDocker(prompter, profile, dockerInfo, existing) {
    const {ask, select} = prompter;
    section('Docker options');
    if (profile === 'static') {
        note('Static profile selected; skipping Docker-specific options.');
        return cloneConfig().docker;
    }
    if (!dockerInfo.available) {
        note(`Docker is not available (${dockerInfo.reason}); skipping Docker-specific options.`);
        return cloneConfig().docker;
    }
    note(
        `Docker engine ${dockerInfo.version} detected${dockerInfo.compose ? ' with compose' : ' (no compose plugin)'}.`,
    );
    const docker = {...cloneConfig().docker, ...(existing?.docker || {})};
    docker.imageName = await ask('Image name (may include registry/namespace)', {
        default: docker.imageName,
        validate: value =>
            /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(String(value))
                ? true
                : 'Invalid Docker image reference.',
    });
    docker.containerName = await ask('Container name', {
        default: docker.containerName,
        validate: value =>
            /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(String(value)) ? true : 'Invalid Docker container name.',
    });
    docker.port = Number(
        await ask('Host port', {
            default: docker.port,
            validate: value => (isPort(value) ? true : 'Enter a valid TCP port (1-65535).'),
        }),
    );
    if (await portInUse(docker.port))
        warning(`Port ${docker.port} appears to be in use already; pick a free port if the start step fails.`);
    docker.restartPolicy = await select(
        'Restart policy',
        [
            {value: 'unless-stopped', label: 'unless-stopped'},
            {value: 'always', label: 'always'},
            {value: 'on-failure', label: 'on-failure'},
            {value: 'no', label: 'no'},
        ],
        {defaultIndex: Math.max(0, ['unless-stopped', 'always', 'on-failure', 'no'].indexOf(docker.restartPolicy))},
    );
    return docker;
}

export const getReviewRows = (config, dockerInfo) => {
    const rows = [
        ['Profile', config.profile],
        ['Clean before build', config.clean ? 'yes' : 'no'],
        ['Apple Emoji sprite', config.disableAppleEmojis ? 'excluded' : 'included'],
        ['Base path', config.basePath],
        ['Load from URL', config.loadFromUrl ? 'yes' : 'no'],
        ['Downloader proxy', config.downloaderTemplate || '—'],
        ['Proxy example', config.proxyExample !== 'none' ? config.proxyExample : '—'],
        ['Public origin', config.deploymentOrigin || '—'],
        [
            'AI gateway',
            config.aiGateway.enabled ? `${config.aiGateway.provider} · ${config.aiGateway.model}` : 'disabled',
        ],
    ];
    if (config.aiGateway.enabled) {
        rows.push(['Gateway port', String(config.aiGateway.port)]);
        rows.push(['Gateway origins', config.aiGateway.origins]);
        if (config.aiGateway.baseUrl) rows.push(['AI base URL', config.aiGateway.baseUrl]);
        rows.push([
            'AI proxy example',
            config.aiGateway.aiProxyExample !== 'none' ? config.aiGateway.aiProxyExample : '—',
        ]);
        rows.push(['API key', config.aiGateway.apiKey ? 'configured' : 'not set']);
        rows.push(['Gateway token', config.aiGateway.token ? 'generated/configured' : 'not set']);
    }
    if (config.profile !== 'static' && dockerInfo.available) {
        rows.push(['Docker engine', dockerInfo.version]);
        rows.push(['Docker image', config.docker.imageName]);
        rows.push(['Container', `${config.docker.containerName} on :${config.docker.port}`]);
        rows.push(['Restart policy', config.docker.restartPolicy]);
    } else if (config.profile !== 'static' && !dockerInfo.available) {
        rows.push(['Docker', `unavailable (${dockerInfo.reason})`]);
    }
    return rows;
};

export const renderReview = rows => {
    const width = Math.max(...rows.map(([key]) => key.length));
    hline();
    rows.forEach(([key, value]) => console.log(`   ${ui.bold(key.padEnd(width))}  ${ui.dim('·')}  ${value}`));
    hline();
};
