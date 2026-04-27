# **Assignment 6: Feature Complete & Peer Playtesting**

**Prerequisite:** Completion of Assignment 5 (Beta Build & Advanced Feature Integration).

## **1\. Overview**

In Assignment 5, you expanded your vertical slice and focused on integrating your secondary technical pillars, bringing your project to a Beta state.

Assignment 6 represents a critical milestone: the **Feature Freeze**. This means that all intended gameplay mechanics, rendering pipelines, AI integrations, and UI elements must be present and functional in your software. As part of this assignment, your team will also conduct a formal playtest with at least 5 subjects from the class. The objective feedback gathered here regarding performance drops, visual glitches, or UI confusion will provide actionable data for your final optimization sprint in Assignment 7\.

## **1.5 Submission Requirements**

**Added by TA:** Please note that you do not need to beautify your report using LLMs. Reports should be clear, concise and comprehensively reflect your effort on the implementation. It should perform as a tool to help us understand your idea and code.

**Report Format:** Markdown files.

## **2\. Phase 1: Feature Completion**

Your primary focus for this sprint is finalizing all planned development.

* **The Freeze:** No new features, mechanics, or significant architectural changes may be introduced after this deadline. Your focus moving forward will solely be on polish, optimization, and bug fixing.  
* **Completeness:** Every feature outlined in your updated Production Plan (from Assignment 4\) must be implemented. If a feature from your original spec was cut, it should have already been documented in previous release notes.  
* **Asset Integration:** All final (or near-final) art, audio, and UI assets should be integrated. The experience should represent the complete intended vision, even if it lacks final polish.

## **3\. Phase 2: Peer Playtesting & User Study**

Your submitted software must not only be ready for external users, but actively tested by them. For this phase, you must conduct a formal playtest with **at least 5 subjects from the class**.

* **The Subjects:** Find at least 5 classmates (outside of your own group) to play through your Feature Complete build.  
* **Usability & Onboarding:** The build must be intuitive enough for the subjects to navigate. Ensure your start menu or introductory sequence clearly explains the objectives.  
* **Testing Protocol:** To gather the best actionable data, follow this structure for each playtest session:  
  1. **Introduction:** Briefly introduce the project premise, but **do not explain the controls**. Let your game's onboarding/UI do the work.  
  2. **Observation (Think-Aloud Protocol):** Ask the subject to vocalize their thought process as they play (e.g., "I'm trying to click this because it's glowing," or "I don't know where to go next"). **Do not guide them** unless they are completely stuck and unable to proceed.  
  3. **Silent Note-taking:** While they play, record specific observations: Where did they fail? Did the framerate drop during specific interactions? Did they miss important UI prompts? Did the physics/shaders break?  
  4. **Post-Play Interview:** Ask the subject a standard set of questions after they finish, such as:  
     * *What was the most confusing or frustrating part of the experience?*  
     * *On a scale of 1-10, how intuitive were the controls?*  
     * *Did you notice any visual glitches or lag? If so, when?*

## **4\. Phase 3: Deliverables & Submission Checklist**

**Submission Format:**

* **Markdown Report** containing the Feature Complete Release Notes and User Study Results.  
* **Zip file** of the build OR a link to the hosted project.

**Checklist:**

* \[ \] **Feature Complete Build / Web Link:**  
  * For WebGL: An updated live URL.  
  * For Desktop: A compiled executable or strict run instructions.  
* \[ \] **Source Code:** Link to your updated public GitHub repository.  
* \[ \] **Feature Complete Release Notes (in Markdown):** A concise list of changes since the Beta Build (Assignment 5).  
  * *Final Feature Integrations:* Detail the last remaining features that were implemented during this sprint to reach the freeze.  
* \[ \] **User Study Results (in Markdown):** A summary of your peer playtesting sessions.  
  * *Methodology:* Briefly describe how the tests were conducted.  
  * *Subject Feedback:* Summarize the feedback and observations from your 5 subjects (e.g., UI confusion, difficulty curves, performance drops).  
  * *Action Items:* List 3-5 specific changes, bug fixes, or optimizations you will make in Assignment 7 based on this playtest data.