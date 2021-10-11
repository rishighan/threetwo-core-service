const jsdom = require("jsdom");
const { JSDOM } = jsdom;


export const scrapeIssuesFromDOM = (html: string) => {
    const dom = new JSDOM(html);
    return dom.window.document.querySelector("p").textContent;
}