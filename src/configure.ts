import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

// Configure before the data client is constructed, including module evaluation.
Amplify.configure(outputs);
