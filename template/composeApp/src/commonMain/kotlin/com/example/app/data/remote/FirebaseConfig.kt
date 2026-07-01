package __PACKAGE__.data.remote

// Region for Cloud Functions / callables. Keep schedulers, callables, Firestore in the
// SAME region — cross-region 2nd-gen wiring fails.
const val FIREBASE_FUNCTIONS_REGION = "__REGION__"
