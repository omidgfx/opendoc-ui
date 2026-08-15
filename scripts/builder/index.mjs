#!/usr/bin/env node
/**
 * OpenDoc UI Builder — `npm run make`
 *
 * Guided, cross-platform production build/deployment CLI. The entry point
 * orchestrates the flow; the implementation lives in small modules:
 *
 *   paths.mjs      shared paths + package metadata
 *   ui.mjs         colors, symbols, banners, prompting primitives
 *   validators.mjs input validation helpers
 *   config.mjs     configuration schema, validation, load/save
 *   env.mjs        .env read/write and child-process spawning
 *   docker.mjs     docker capability probing, ports, health polling
 *   build.mjs      build output verification
 *   steps.mjs      the guided question steps and review summary
 *   artifacts.mjs  runtime artifact writers
 *   start.mjs      post-build start choices and deployment notes
 *   lifecycle.mjs  shared state for SIGINT and child tracking
 *
 * Design rules:
 * - `npm run build` itself is never modified.
 * - VITE_* variables are injected only into the child build process.
 * - Runtime secrets live only in `.env` (never in builder.config.json).
 * - All child processes run from the OpenDoc project root.
 * - Configuration is validated both when collected and when loaded.
 * - Build happens first; configuration is committed only after verification.
 * - Builder-managed `.env` entries are removed when no longer applicable.
 * - Existing unrelated `.env` entries and formatting are preserved.
 *
 * Usage: npm run make
 */
import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';
import {pkg} from './paths.mjs';
import {banner, createPrompter, createReadline, fail, section, success, ui, warning} from './ui.mjs';
import {lifecycle} from './lifecycle.mjs';
import {cloneConfig, loadLastConfig, normalizeLoadedConfig, validateConfig} from './config.mjs';
import {probeDocker} from './docker.mjs';
import {runBuild} from './build.mjs';
import {
    getReviewRows,
    renderReview,
    stepAiGateway,
    stepDocker,
    stepDownloadProxy,
    stepFrontend,
    stepProfile,
} from './steps.mjs';
import {writeArtifacts} from './artifacts.mjs';
import {startChoice} from './start.mjs';

const MIN_NODE_MAJOR = 18;

const prompter = createPrompter();

process.on('SIGINT', () => {
    console.log('');
    for (const child of lifecycle.children) {
        try {
            child.kill();
        } catch {
            // already gone
        }
    }
    if (lifecycle.artifactsWritten)
        console.log(ui.yellow('⚠ Aborted. Configuration and build output were already written.'));
    else if (lifecycle.buildStarted)
        console.log(ui.yellow('⚠ Aborted. The build was interrupted; configuration was not written.'));
    else console.log(ui.dim('Aborted by user. Nothing was changed.'));
    process.exit(130);
});

async function main() {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor < MIN_NODE_MAJOR) {
        console.log(fail(`Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.versions.node}).`));
        process.exit(1);
    }

    const dockerInfo = probeDocker();
    if (dockerInfo.available && !dockerInfo.compose)
        warning('Docker engine detected but the compose plugin is missing; Docker start will not be offered.');

    let config = null;
    let collect = true;
    const last = loadLastConfig();
    if (last) {
        try {
            const loaded = normalizeLoadedConfig(last);
            console.log(ui.dim('\nPrevious configuration found:'));
            printPreviousSummary(loaded, dockerInfo);
            const mode = await prompter.select('What do you want to do?', [
                {value: 'use', label: 'Use this configuration', hint: 'rebuild with the same settings'},
                {value: 'edit', label: 'Edit it', hint: 'walk through the questions with these values as defaults'},
                {value: 'fresh', label: 'Start fresh'},
            ]);
            if (mode === 'use') {
                config = loaded;
                collect = false;
                success('Previous configuration loaded.');
            } else if (mode === 'edit') {
                config = loaded;
            }
        } catch (error) {
            warning(`${error.message} Starting fresh.`);
        }
    }

    if (collect) {
        for (;;) {
            const existing = config;
            const profile = await stepProfile(prompter, existing);
            const frontend = await stepFrontend(prompter, existing);
            const download = await stepDownloadProxy(prompter, existing);
            const aiGateway = await stepAiGateway(prompter, existing, profile.deploymentOrigin);
            const docker = await stepDocker(prompter, profile.profile, dockerInfo, existing);
            config = {...cloneConfig(), ...profile, ...frontend, ...download, aiGateway, docker};
            const error = validateConfig(config);
            if (error) {
                warning(error);
                continue;
            }
            section('Review');
            renderReview(getReviewRows(config, dockerInfo));
            const proceed = await prompter.confirm('Looks good — build with this configuration?', true);
            if (proceed) break;
            const again = await prompter.select('What now?', [
                {value: 'restart', label: 'Start the questions over'},
                {value: 'quit', label: 'Quit without building'},
            ]);
            if (again === 'quit') {
                console.log(ui.dim('\nNothing was written or built. Goodbye.'));
                process.exit(0);
            }
        }
    } else {
        // "Use previous configuration": confirm the review, then build.
        section('Review');
        renderReview(getReviewRows(config, dockerInfo));
        const proceed = await prompter.confirm('Build with this configuration?', true);
        if (!proceed) {
            console.log(ui.dim('\nNothing was written or built. Goodbye.'));
            process.exit(0);
        }
    }

    const verified = await runBuild(config);
    if (!verified) process.exit(1);

    lifecycle.artifactsWritten = true;
    writeArtifacts(config);
    await startChoice(prompter, config, dockerInfo);
    console.log(`\n${ui.dim('Thanks for using the OpenDoc UI builder.')}\n`);
}

const printPreviousSummary = (config, dockerInfo) => {
    console.log('');
    renderReview(getReviewRows(config, dockerInfo));
};

let finished = false;
const rl = createReadline();
prompter.attachReadline(rl);
if (rl) {
    rl.on('close', () => {
        if (!finished) {
            console.log(ui.red('\nInput closed unexpectedly. Run npm run make again in an interactive terminal.'));
            process.exit(1);
        }
    });
}

banner(pkg.version);
main()
    .catch(error => {
        console.log(ui.red(`\nUnexpected error: ${error?.message || error}`));
        process.exit(1);
    })
    .finally(() => {
        finished = true;
        try {
            rl?.close();
        } catch {
            // already closed
        }
    });
