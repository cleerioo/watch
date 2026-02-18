document.addEventListener("DOMContentLoaded", () => {
  renderBlogLanding();
  renderBlogPost();
});

function renderBlogLanding() {
  const listRoot = document.getElementById("blog-list");
  if (!listRoot) return;

  const posts = window.LWC.data.blogPosts;
  const sidebarRecent = document.getElementById("blog-recent");
  const sidebarTags = document.getElementById("blog-tags");

  listRoot.innerHTML = posts.map((post) => window.LWC.createPostCard(post)).join("");

  if (sidebarRecent) {
    sidebarRecent.innerHTML = posts
      .slice(0, 5)
      .map(
        (post) =>
          `<a href="blog-post.html?id=${post.id}">${post.title}</a><small style="display:block;color:#666;margin-bottom:8px;">${new Date(
            post.date
          ).toLocaleDateString("en-IN")}</small>`
      )
      .join("");
  }

  if (sidebarTags) {
    const tags = [...new Set(posts.flatMap((post) => post.tags))].slice(0, 12);
    sidebarTags.innerHTML = tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
  }

  document.getElementById("blog-subscribe-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    window.LWC.showToast("Thanks for subscribing to our watch journal.");
    event.target.reset();
  });
}

function renderBlogPost() {
  const root = document.getElementById("blog-post-root");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const post =
    window.LWC.data.blogPosts.find((item) => item.id === id) ||
    window.LWC.data.blogPosts[0];
  if (!post) return;

  document.title = `${post.title} | BrandsHub49 Blog`;

  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", post.excerpt);

  root.innerHTML = `
    <article class="article">
      <img src="${post.image}" alt="${post.title}" loading="eager" />
      <div class="article-inner">
        <h1>${post.title}</h1>
        <div class="post-meta">${new Date(post.date).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric"
        })} | ${post.author}</div>
        <div class="tag-list" style="margin-bottom: 12px;">${post.tags
          .map((tag) => `<span class="tag">${tag}</span>`)
          .join("")}</div>
        <div class="article-content">
          ${post.content.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </div>
        <div class="share-row" style="margin-top: 14px;">
          <span>Share:</span>
          <a class="share-link" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            window.location.href
          )}">f</a>
          <a class="share-link" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(
            window.location.href
          )}">x</a>
          <a class="share-link" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=${encodeURIComponent(
            `Read this article: ${window.location.href}`
          )}">w</a>
        </div>
      </div>
    </article>
  `;
}
