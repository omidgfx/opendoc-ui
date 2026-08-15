/** Shared lifecycle state for the SIGINT handler and child tracking. */

export const lifecycle = {
    artifactsWritten: false,
    buildStarted: false,
    children: new Set(),
};

export const trackChild = child => {
    lifecycle.children.add(child);
    child.on('close', () => lifecycle.children.delete(child));
    child.on('error', () => lifecycle.children.delete(child));
};
