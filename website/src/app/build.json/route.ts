export const dynamic = 'force-static';
// The commit this build was made from; the IndexNow workflow polls it to know the live site is current.
export function GET(){return Response.json({commit:process.env.CF_PAGES_COMMIT_SHA??'local'});}
