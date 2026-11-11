import { BlogList, BlogPost } from '../../components/BlogViews.jsx'

/** Students: the blog list. */
export default function Blog() {
  return (
    <>
      <h1>Blog</h1>
      <p className="sm" style={{ marginTop: 0 }}>Study tips, news and advice from JAMBwise.</p>
      <BlogList base="/app/blog" />
    </>
  )
}

/** Students: one post. */
export function BlogRead() {
  return <BlogPost base="/app/blog" />
}
