import { createFileRoute } from "@tanstack/react-router";
import { CounsellorCourseDetail } from "@/components/counsellor/screens/course-detail";

// Read-only course detail (counsellor catalogue). The trailing underscore on
// `courses_` keeps this a sibling of /universities/courses rather than a child.
export const Route = createFileRoute("/universities/courses_/$id")({
  head: () => ({ meta: [{ title: "Course — upCarrera" }] }),
  component: CourseDetailRoute,
});

function CourseDetailRoute() {
  const { id } = Route.useParams();
  return <CounsellorCourseDetail idParam={id} />;
}
