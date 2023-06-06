"use strict"

function queueMacrotask(callback) {
    setTimeout(callback, 0);
}

export default queueMacrotask;